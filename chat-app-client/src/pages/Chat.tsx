import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { FiSend, FiLogOut, FiUsers, FiSmile, FiMoreVertical, FiCheck, FiCheckCircle, FiTrash2, FiX, FiPhone, FiPhoneIncoming, FiPhoneOff } from 'react-icons/fi';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import VideoCall from '../components/VideoCall';

interface Message {
  _id: string;
  sender: string;
  receiver: string;
  message: string;
  timestamp: string;
  status: 'sent' | 'delivered' | 'read';
}

interface User {
  username: string;
  lastSeen: string;
  isTyping?: boolean;
  unreadCount?: number;
}

interface DeletedMessages {
  _id: string;
  sender: string;
  receiver: string;
}

interface CallState {
  isReceivingCall: boolean;
  from: string;
  signal: any;
}

const Chat = () => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{[key: string]: boolean}>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const currentUser = localStorage.getItem('username');
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [unreadCounts, setUnreadCounts] = useState<{[key: string]: number}>({});
  const [selectedMessages, setSelectedMessages] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const [isInCall, setIsInCall] = useState(false);
  const [callState, setCallState] = useState<CallState | null>(null);

  useEffect(() => {
    const newSocket = io('/', {
      path: '/socket.io'
    });
    setSocket(newSocket);

    newSocket.emit('user_connected', currentUser);

    return () => {
      newSocket.close();
    };
  }, [currentUser]);

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages();
    }
  }, [selectedUser]);

  useEffect(() => {
    if (socket) {
      socket.on('typing', ({ username, isTyping }) => {
        setTypingUsers(prev => ({ ...prev, [username]: isTyping }));
      });

      socket.on('receive_message', (message: Message) => {
        if (
          (message.sender === selectedUser && message.receiver === currentUser) ||
          (message.sender === currentUser && message.receiver === selectedUser)
        ) {
          setMessages(prev => {
            if (prev.some(m => m._id === message._id)) {
              return prev;
            }
            return [...prev, message];
          });

          if (message.sender === selectedUser && message.receiver === currentUser) {
            socket.emit('mark_as_read', { messageId: message._id, sender: selectedUser });
          }
        } else if (message.receiver === currentUser) {
          setUnreadCounts(prev => ({
            ...prev,
            [message.sender]: (prev[message.sender] || 0) + 1
          }));
        }
      });

      socket.on('message_read', ({ messageId }) => {
        setMessages(prev => 
          prev.map(msg => 
            msg._id === messageId ? { ...msg, status: 'read' } : msg
          )
        );
      });

      socket.on('messages_deleted', ({ deletedMessages }: { deletedMessages: DeletedMessages[] }) => {
        setMessages(prev => {
          // Remove all messages that were deleted
          const updatedMessages = prev.filter(msg => 
            !deletedMessages.some(deleted => deleted._id === msg._id)
          );
          return updatedMessages;
        });
      });

      socket.on('callUser', ({ from, signal }) => {
        setCallState({
          isReceivingCall: true,
          from,
          signal
        });
      });

      socket.on('endCall', () => {
        setIsInCall(false);
        setCallState(null);
      });

      return () => {
        socket.off('typing');
        socket.off('receive_message');
        socket.off('message_read');
        socket.off('messages_deleted');
        socket.off('callUser');
        socket.off('endCall');
      };
    }
  }, [socket, selectedUser, currentUser]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        actionsMenuRef.current &&
        !actionsMenuRef.current.contains(event.target as Node)
      ) {
        setShowActionsMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/users');
      const data = await response.json();
      const filteredUsers = data.filter((user: User) => user.username !== currentUser);
      
      if (searchTerm) {
        setUsers(
          filteredUsers.filter(user => 
            user.username.toLowerCase().includes(searchTerm.toLowerCase())
          )
        );
      } else {
        setUsers(filteredUsers);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, [searchTerm, currentUser]);

  const fetchMessages = async () => {
    if (!selectedUser) return;
    try {
      const response = await fetch(
        `/api/messages/${currentUser}/${selectedUser}`
      );
      const data = await response.json();
      setMessages(data);
      scrollToBottom();
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleTyping = () => {
    if (!socket || !selectedUser) return;

    if (!isTyping) {
      setIsTyping(true);
      socket.emit('typing', { receiver: selectedUser, isTyping: true });
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
      socket.emit('typing', { receiver: selectedUser, isTyping: false });
    }, 2000);
  };

  const handleEmojiSelect = (emoji: any) => {
    setNewMessage(prev => prev + emoji.native);
    setShowEmojiPicker(false);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedUser || !socket) return;

    const messageData = {
      sender: currentUser,
      receiver: selectedUser,
      message: newMessage.trim(),
    };

    try {
      socket.emit('send_message', messageData);
      setNewMessage('');
      setShowEmojiPicker(false);
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    navigate('/login');
  };

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));

    if (days === 0) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (days === 1) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString();
    }
  };

  const handleUserSelect = async (username: string) => {
    setSelectedUser(username);
    setMessages([]);
    setUnreadCounts(prev => ({ ...prev, [username]: 0 }));

    try {
      const response = await fetch(`/api/messages/${currentUser}/${username}`);
      const data = await response.json();
      
      const unreadMessages = data.filter(
        (message: Message) => 
          message.sender === username && 
          message.receiver === currentUser && 
          message.status !== 'read'
      );

      setMessages(data);

      if (unreadMessages.length > 0 && socket) {
        unreadMessages.forEach((message: Message) => {
          socket.emit('mark_as_read', { messageId: message._id, sender: username });
        });
      }

      scrollToBottom();
    } catch (error) {
      console.error('Failed to fetch messages:', error);
    }
  };

  const handleMessageSelect = (messageId: string) => {
    if (!isSelectionMode) {
      setIsSelectionMode(true);
    }
    
    setSelectedMessages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
        if (newSet.size === 0) {
          setIsSelectionMode(false);
        }
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    const userMessages = messages.filter(msg => msg.sender === currentUser);
    if (selectedMessages.size === userMessages.length) {
      setSelectedMessages(new Set());
      setIsSelectionMode(false);
    } else {
      setSelectedMessages(new Set(userMessages.map(msg => msg._id)));
      setIsSelectionMode(true);
    }
  };

  const handleClearChat = async () => {
    if (!selectedUser || !currentUser) return;

    try {
      const response = await fetch('/api/messages/clear-chat', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: currentUser,
          otherUserId: selectedUser,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Remove deleted messages locally
        setMessages(prev => prev.filter(msg => msg.sender !== currentUser));
        
        // Notify other user about deleted messages
        socket?.emit('messages_deleted', {
          deletedMessages: data.deletedMessages,
          receiver: selectedUser
        });
      }
    } catch (error) {
      console.error('Failed to clear chat:', error);
    }
    setShowActionsMenu(false);
  };

  const handleDeleteSelected = async () => {
    if (selectedMessages.size === 0) return;

    try {
      const response = await fetch('/api/messages', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messageIds: Array.from(selectedMessages),
          userId: currentUser,
        }),
      });

      const data = await response.json();
      if (data.success) {
        // Remove deleted messages locally
        setMessages(prev => prev.filter(msg => !selectedMessages.has(msg._id)));
        
        // Notify other user about deleted messages
        socket?.emit('messages_deleted', {
          deletedMessages: data.deletedMessages,
          receiver: selectedUser
        });

        setSelectedMessages(new Set());
        setIsSelectionMode(false);
      }
    } catch (error) {
      console.error('Error deleting messages:', error);
    }
  };

  const cancelSelection = () => {
    setSelectedMessages(new Set());
    setIsSelectionMode(false);
  };

  const handleStartCall = () => {
    if (!selectedUser || !socket) return;
    setIsInCall(true);
    setCallState({
      isReceivingCall: false,
      from: selectedUser,
      signal: null
    });
  };

  const handleAcceptCall = () => {
    if (callState) {
      setIsInCall(true);
    }
  };

  const handleRejectCall = () => {
    if (callState) {
      socket?.emit('rejectCall', { user: callState.from });
      setCallState(null);
    }
  };

  const handleEndCall = () => {
    setIsInCall(false);
    setCallState(null);
  };

  return (
    <Container>
      <Sidebar>
        <SidebarHeader>
          <Username>{currentUser}</Username>
          <LogoutButton onClick={handleLogout}>
            <FiLogOut />
          </LogoutButton>
        </SidebarHeader>

        <SearchContainer>
          <SearchInput
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </SearchContainer>

        <UsersList>
          <AnimatePresence>
            {users.map((user) => (
              <UserItem
                key={user.username}
                onClick={() => handleUserSelect(user.username)}
                selected={selectedUser === user.username}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                <UserAvatar $small={selectedUser === user.username}>
                  {user.username[0].toUpperCase()}
                </UserAvatar>
                <UserInfo>
                  <UserNameContainer>
                    <UserName>{user.username}</UserName>
                    {unreadCounts[user.username] > 0 && (
                      <UnreadBadge>{unreadCounts[user.username]}</UnreadBadge>
                    )}
                  </UserNameContainer>
                  <LastSeen>
                    {user.isTyping ? (
                      <TypingIndicator>typing...</TypingIndicator>
                    ) : (
                      `Last seen: ${formatTime(user.lastSeen)}`
                    )}
                  </LastSeen>
                </UserInfo>
              </UserItem>
            ))}
          </AnimatePresence>
        </UsersList>
      </Sidebar>

      <ChatArea>
        {selectedUser ? (
          <>
            <ChatHeader>
              <ChatWithUserContainer>
                {isSelectionMode ? (
                  <SelectionInfo>
                    <span>{selectedMessages.size} selected</span>
                    <HeaderActionButton onClick={handleSelectAll}>
                      {selectedMessages.size === messages.filter(msg => msg.sender === currentUser).length
                        ? 'Deselect All'
                        : 'Select All'}
                    </HeaderActionButton>
                    <HeaderActionButton onClick={cancelSelection}>
                      Cancel
                    </HeaderActionButton>
                  </SelectionInfo>
                ) : (
                  <>
                    <UserAvatar $small>
                      {selectedUser[0].toUpperCase()}
                    </UserAvatar>
                    <UserInfo>
                      <UserName>{selectedUser}</UserName>
                      {typingUsers[selectedUser] && (
                        <TypingIndicator>typing...</TypingIndicator>
                      )}
                    </UserInfo>
                  </>
                )}
              </ChatWithUserContainer>
              <HeaderActions>
                {!isSelectionMode && (
                  <IconButton onClick={handleStartCall}>
                    <FiPhone />
                  </IconButton>
                )}
                {isSelectionMode ? (
                  <DeleteButton onClick={handleDeleteSelected}>
                    <FiTrash2 />
                  </DeleteButton>
                ) : (
                  <ActionsMenuWrapper ref={actionsMenuRef}>
                    <IconButton onClick={() => setShowActionsMenu(!showActionsMenu)}>
                      <FiMoreVertical />
                    </IconButton>
                    {showActionsMenu && (
                      <ActionsMenu>
                        <ActionItem onClick={() => {
                          setIsSelectionMode(true);
                          setShowActionsMenu(false);
                        }}>
                          Select Messages
                        </ActionItem>
                        <ActionItem onClick={handleClearChat}>
                          Clear My Messages
                        </ActionItem>
                      </ActionsMenu>
                    )}
                  </ActionsMenuWrapper>
                )}
              </HeaderActions>
            </ChatHeader>

            <MessagesContainer>
              <AnimatePresence>
                {messages.map((message) => (
                  <MessageBubble
                    key={message._id}
                    sent={message.sender === currentUser}
                    selected={selectedMessages.has(message._id)}
                    onClick={() => message.sender === currentUser && handleMessageSelect(message._id)}
                    selectable={message.sender === currentUser}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                  >
                    <MessageText>{message.message}</MessageText>
                    <MessageInfo>
                      <MessageTime>
                        {formatTime(message.timestamp)}
                      </MessageTime>
                      {message.sender === currentUser && (
                        <MessageStatus>
                          {message.status === 'sent' && <FiCheck />}
                          {message.status === 'delivered' && <><FiCheck /><FiCheck /></>}
                          {message.status === 'read' && <FiCheckCircle />}
                        </MessageStatus>
                      )}
                    </MessageInfo>
                  </MessageBubble>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} />
            </MessagesContainer>

            <MessageForm onSubmit={handleSendMessage}>
              <EmojiPickerWrapper ref={emojiPickerRef}>
                <EmojiButton
                  type="button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                >
                  <FiSmile />
                </EmojiButton>
                {showEmojiPicker && (
                  <EmojiPickerContainer onClick={(e) => e.stopPropagation()}>
                    <Picker 
                      data={data} 
                      onEmojiSelect={handleEmojiSelect}
                      theme="dark"
                      previewPosition="none"
                      skinTonePosition="none"
                    />
                  </EmojiPickerContainer>
                )}
              </EmojiPickerWrapper>
              <MessageInput
                type="text"
                value={newMessage}
                onChange={(e) => {
                  setNewMessage(e.target.value);
                  handleTyping();
                }}
                placeholder="Type a message..."
              />
              <SendButton
                type="submit"
                disabled={!newMessage.trim()}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <FiSend />
              </SendButton>
            </MessageForm>
          </>
        ) : (
          <WelcomeMessage>
            <h2>Welcome to the Chat App!</h2>
            <p>Select a user to start chatting</p>
          </WelcomeMessage>
        )}
      </ChatArea>

      <AnimatePresence>
        {callState?.isReceivingCall && !isInCall && (
          <IncomingCallModal
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
          >
            <CallInfo>
              <CallerName>{callState.from}</CallerName>
              <CallStatus>Incoming video call...</CallStatus>
            </CallInfo>
            <CallActions>
              <AcceptButton onClick={handleAcceptCall}>
                <FiPhoneIncoming />
              </AcceptButton>
              <RejectButton onClick={handleRejectCall}>
                <FiPhoneOff />
              </RejectButton>
            </CallActions>
          </IncomingCallModal>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isInCall && (
          <VideoCall
            socket={socket}
            selectedUser={callState?.from || selectedUser}
            currentUser={currentUser || ''}
            onClose={handleEndCall}
            isReceivingCall={callState?.isReceivingCall}
            signal={callState?.signal}
          />
        )}
      </AnimatePresence>
    </Container>
  );
};

const Container = styled.div`
  display: flex;
  height: 100vh;
  background-color: ${({ theme }) => theme.colors.background};
`;

const Sidebar = styled.div`
  width: 300px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-right: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  flex-direction: column;
`;

const SidebarHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const Username = styled.h2`
  ${({ theme }) => theme.typography.h2};
  color: ${({ theme }) => theme.colors.text};
`;

const LogoutButton = styled.button`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.2rem;
  padding: 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.error};
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const SearchContainer = styled.div`
  padding: 1rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  color: ${({ theme }) => theme.colors.text};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const UsersList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
`;

const UserItem = styled(motion.div)<{ selected: boolean }>`
  display: flex;
  align-items: center;
  padding: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  cursor: pointer;
  background-color: ${({ theme, selected }) =>
    selected ? theme.colors.background : 'transparent'};
  margin-bottom: 0.5rem;
`;

const UserAvatar = styled.div<{ $small?: boolean }>`
  width: ${({ $small }) => $small ? '32px' : '40px'};
  height: ${({ $small }) => $small ? '32px' : '40px'};
  border-radius: ${({ theme }) => theme.borderRadius.round};
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ $small }) => $small ? '1rem' : '1.2rem'};
  font-weight: 600;
  margin-right: 1rem;
`;

const UserInfo = styled.div`
  flex: 1;
`;

const UserNameContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const UserName = styled.div`
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
`;

const LastSeen = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  margin-top: 0.25rem;
`;

const ChatArea = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
`;

const ChatHeader = styled.div`
  padding: 1.5rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const ChatWithUserContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const ChatWithUser = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const MessageBubble = styled(motion.div)<{ sent: boolean; selected?: boolean; selectable?: boolean }>`
  max-width: 70%;
  padding: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.large};
  background-color: ${({ theme, sent, selected }) =>
    selected ? theme.colors.primaryLight :
    sent ? theme.colors.primary : theme.colors.surface};
  align-self: ${({ sent }) => (sent ? 'flex-end' : 'flex-start')};
  position: relative;
  cursor: ${({ selectable }) => selectable ? 'pointer' : 'default'};
  transition: background-color ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme, sent, selected }) =>
      selected ? theme.colors.primaryLight :
      sent ? theme.colors.primaryLight : theme.colors.surface};
  }
`;

const MessageText = styled.div`
  color: ${({ theme }) => theme.colors.text};
  margin-bottom: 0.5rem;
`;

const MessageTime = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  text-align: right;
`;

const MessageForm = styled.form`
  padding: 1.5rem;
  display: flex;
  gap: 1rem;
  border-top: 1px solid ${({ theme }) => theme.colors.border};
`;

const MessageInput = styled.input`
  flex: 1;
  padding: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  color: ${({ theme }) => theme.colors.text};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const SendButton = styled(motion.button)`
  padding: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  font-size: 1.2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background-color ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme }) => theme.colors.primaryLight};
  }

  &:disabled {
    background-color: ${({ theme }) => theme.colors.border};
    cursor: not-allowed;
  }
`;

const WelcomeMessage = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  gap: 1rem;

  h2 {
    ${({ theme }) => theme.typography.h2};
    color: ${({ theme }) => theme.colors.text};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  gap: 1rem;
`;

const IconButton = styled.button`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.2rem;
  padding: 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const MessageInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const MessageStatus = styled.div`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const TypingIndicator = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.875rem;
  font-style: italic;
`;

const EmojiPickerWrapper = styled.div`
  position: relative;
`;

const EmojiPickerContainer = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 10px;
  z-index: 1000;

  em-emoji-picker {
    --background-rgb: ${({ theme }) => theme.colors.surface};
    --border-radius: ${({ theme }) => theme.borderRadius.medium};
    --category-icon-size: 24px;
    height: 350px;
  }

  &::before {
    content: '';
    position: absolute;
    bottom: -8px;
    left: 15px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid ${({ theme }) => theme.colors.surface};
  }
`;

const EmojiButton = styled.button`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.2rem;
  padding: 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.text};
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const UnreadBadge = styled.div`
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.round};
  min-width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
`;

const SelectionInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  color: ${({ theme }) => theme.colors.text};
  font-weight: 600;
`;

const HeaderActionButton = styled.button`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 600;
  padding: 0.5rem 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const DeleteButton = styled(IconButton)`
  color: ${({ theme }) => theme.colors.error};

  &:hover {
    color: ${({ theme }) => theme.colors.error};
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const ActionsMenuWrapper = styled.div`
  position: relative;
`;

const ActionsMenu = styled.div`
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 0.5rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  box-shadow: ${({ theme }) => theme.shadows.medium};
  min-width: 200px;
  z-index: 1000;
`;

const ActionItem = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  &:not(:last-child) {
    border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  }
`;

const IncomingCallModal = styled(motion.div)`
  position: fixed;
  top: 2rem;
  right: 2rem;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.large};
  padding: 1.5rem;
  box-shadow: ${({ theme }) => theme.shadows.large};
  display: flex;
  gap: 2rem;
  align-items: center;
  z-index: 1000;
`;

const CallInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const CallerName = styled.div`
  font-weight: 600;
  color: ${({ theme }) => theme.colors.text};
`;

const CallStatus = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
`;

const CallActions = styled.div`
  display: flex;
  gap: 1rem;
`;

const AcceptButton = styled(IconButton)`
  background-color: ${({ theme }) => theme.colors.success};
  color: white;

  &:hover {
    background-color: ${({ theme }) => theme.colors.success}dd;
  }
`;

const RejectButton = styled(IconButton)`
  background-color: ${({ theme }) => theme.colors.error};
  color: white;

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}dd;
  }
`;

export default Chat; 