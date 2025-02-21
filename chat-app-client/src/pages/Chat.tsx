import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { io, Socket } from 'socket.io-client';
import { FiSend, FiLogOut, FiUsers, FiSmile, FiMoreVertical, FiCheck, FiCheckCircle, FiTrash2, FiX, FiPhone, FiPhoneIncoming, FiPhoneOff, FiArrowLeft, FiZap } from 'react-icons/fi';
import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';
import VideoCall from '../components/VideoCall';
import { playRingtone, stopRingtone } from '../utils/audioUtils';
import ReactDOM from 'react-dom';

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

interface ShortMessage {
  text: string;
  icon?: string;
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
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);

  const shortMessages: ShortMessage[] = [
    { text: "👋 Hi there!" },
    { text: "How are you?" },
    { text: "Talk to you later!" },
    { text: "In a meeting right now" },
    { text: "Be right back" },
    { text: "Thanks!" },
  ];

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
    // Request notification permissions when component mounts
    const requestNotificationPermission = async () => {
      try {
        if ('Notification' in window) {
          const permission = await Notification.requestPermission();
          setNotificationsEnabled(permission === 'granted');
        }
      } catch (error) {
        console.error('Error requesting notification permission:', error);
      }
    };
    requestNotificationPermission();
  }, []);

  useEffect(() => {
    if (socket) {
      // Create a single handler for typing events
      const handleTyping = ({ username, isTyping }: { username: string; isTyping: boolean }) => {
        setTypingUsers(prev => ({ ...prev, [username]: isTyping }));
      };

      // Create a single handler for receiving messages
      const handleReceiveMessage = (message: Message) => {
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

          // Show desktop notification for new message
          if (notificationsEnabled && document.visibilityState === 'hidden') {
            try {
              const notification = new Notification('New Message', {
                body: `${message.sender}: ${message.message}`,
                icon: '/chat-icon.png',
                tag: 'chat-message',
              });

              setTimeout(() => notification.close(), 5000);

              notification.onclick = () => {
                window.focus();
                handleUserSelect(message.sender);
              };
            } catch (error) {
              console.error('Error showing notification:', error);
            }
          }
        }
      };

      // Create a single handler for message read status
      const handleMessageRead = ({ messageId }: { messageId: string }) => {
        setMessages(prev => 
          prev.map(msg => 
            msg._id === messageId ? { ...msg, status: 'read' } : msg
          )
        );
      };

      // Create a single handler for deleted messages
      const handleMessagesDeleted = ({ deletedMessages }: { deletedMessages: DeletedMessages[] }) => {
        setMessages(prev => {
          const updatedMessages = prev.filter(msg => 
            !deletedMessages.some(deleted => deleted._id === msg._id)
          );
          return updatedMessages;
        });
      };

      // Create a single handler for incoming calls
      const handleIncomingCall = ({ from, signal }: { from: string; signal: any }) => {
        console.log('Incoming call from:', from);
        setCallState({
          isReceivingCall: true,
          from,
          signal
        });

        if (notificationsEnabled && document.visibilityState === 'hidden') {
          try {
            const notification = new Notification('Incoming Video Call', {
              body: `${from} is calling you`,
              icon: '/chat-icon.png',
              tag: 'video-call',
              requireInteraction: true
            });

            notification.onclick = () => {
              window.focus();
              handleAcceptCall();
              notification.close();
            };
          } catch (error) {
            console.error('Error showing call notification:', error);
          }
        }

        playRingtone().catch(error => {
          console.error('Failed to play ringtone:', error);
        });
      };

      // Create a single handler for call end
      const handleCallEnd = async () => {
        console.log('Call ended');
        stopRingtone();
        setIsInCall(false);
        setCallState(null);

        if (notificationsEnabled && 'serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              const notifications = await registration.getNotifications({ tag: 'video-call' });
              notifications.forEach((notification: Notification) => notification.close());
            }
          } catch (error) {
            console.error('Error closing call notification:', error);
          }
        }
      };

      // Create a single handler for rejected calls
      const handleCallRejected = async () => {
        console.log('Call was declined');
        setIsInCall(false);
        setCallState(null);

        if (notificationsEnabled && 'serviceWorker' in navigator) {
          try {
            const registrations = await navigator.serviceWorker.getRegistrations();
            for (const registration of registrations) {
              const notifications = await registration.getNotifications({ tag: 'video-call' });
              notifications.forEach((notification: Notification) => notification.close());
            }
          } catch (error) {
            console.error('Error closing call notification:', error);
          }
        }

        // Show declined call notification
        const CallDeclinedModal = (
          <IncomingCallModal
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
          >
            <CallInfo>
              <CallerName>{selectedUser}</CallerName>
              <CallStatus style={{ color: '#EF4444' }}>Call declined</CallStatus>
            </CallInfo>
          </IncomingCallModal>
        );

        const modalElement = document.createElement('div');
        document.body.appendChild(modalElement);
        ReactDOM.render(CallDeclinedModal, modalElement);

        setTimeout(() => {
          document.body.removeChild(modalElement);
        }, 3000);
      };

      // Register all event handlers
      socket.on('typing', handleTyping);
      socket.on('receive_message', handleReceiveMessage);
      socket.on('message_read', handleMessageRead);
      socket.on('messages_deleted', handleMessagesDeleted);
      socket.on('callUser', handleIncomingCall);
      socket.on('endCall', handleCallEnd);
      socket.on('callRejected', handleCallRejected);

      // Cleanup function to remove all event listeners
      return () => {
        socket.off('typing', handleTyping);
        socket.off('receive_message', handleReceiveMessage);
        socket.off('message_read', handleMessageRead);
        socket.off('messages_deleted', handleMessagesDeleted);
        socket.off('callUser', handleIncomingCall);
        socket.off('endCall', handleCallEnd);
        socket.off('callRejected', handleCallRejected);
        stopRingtone();
      };
    }
  }, [socket, selectedUser, currentUser, notificationsEnabled]);

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
          filteredUsers.filter((user: User) => 
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
      setTimeout(scrollToBottom, 100);
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

  const handleShortMessageSelect = (message: string) => {
    setNewMessage(message);
    setShowShortcuts(false);
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
      scrollToBottom();
    } catch (error) {
      console.error('Failed to send message:', error);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('username');
    navigate('/login');
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
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
      console.log('Call accepted');
      stopRingtone();
      setIsInCall(true);
    }
  };

  const handleRejectCall = () => {
    if (callState) {
      console.log('Call rejected');
      stopRingtone();
      socket?.emit('rejectCall', { user: callState.from });
      setCallState(null);
    }
  };

  const handleEndCall = () => {
    console.log('Ending call');
    stopRingtone();
    setIsInCall(false);
    setCallState(null);
  };

  const handleBack = () => {
    // Logic to close the chat or navigate back
    handleEndCall(); // Assuming handleEndCall will handle closing the call
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
                <BackButton onClick={() => setSelectedUser(null)}>
                  <FiArrowLeft />
                </BackButton>
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
                        <MessageStatus className={message.status === 'read' ? 'read' : ''}>
                          {message.status === 'sent' && <FiCheck />}
                          {message.status === 'delivered' && (
                            <>
                              <FiCheck />
                              <FiCheck />
                            </>
                          )}
                          {message.status === 'read' && <FiCheckCircle />}
                        </MessageStatus>
                      )}
                    </MessageInfo>
                  </MessageBubble>
                ))}
              </AnimatePresence>
              <div ref={messagesEndRef} style={{ height: '1px' }} />
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

              <ShortcutWrapper>
                <ShortcutButton
                  type="button"
                  onClick={() => setShowShortcuts(!showShortcuts)}
                >
                  <FiZap />
                </ShortcutButton>
                {showShortcuts && (
                  <ShortcutMenu onClick={(e) => e.stopPropagation()}>
                    {shortMessages.map((msg, index) => (
                      <ShortcutItem
                        key={index}
                        onClick={() => handleShortMessageSelect(msg.text)}
                      >
                        {msg.text}
                      </ShortcutItem>
                    ))}
                  </ShortcutMenu>
                )}
              </ShortcutWrapper>

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
            selectedUser={callState?.from || selectedUser || ''}
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
  background: linear-gradient(135deg, 
    ${({ theme }) => theme.colors.background} 0%,
    ${({ theme }) => theme.colors.surface} 100%);
  backdrop-filter: blur(10px);
  animation: fadeIn 0.3s ease-in-out;

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
`;

const Sidebar = styled.div`
  width: ${({ theme }) => theme.layout.sidebarWidth};
  background-color: ${({ theme }) => `${theme.colors.surface}CC`};
  border-right: 1px solid ${({ theme }) => `${theme.colors.border}80`};
  display: flex;
  flex-direction: column;
  box-shadow: ${({ theme }) => theme.shadows.medium};
  backdrop-filter: blur(8px);
  animation: slideIn 0.4s ease-out;

  @keyframes slideIn {
    from { transform: translateX(-100%); }
    to { transform: translateX(0); }
  }
`;

const SidebarHeader = styled.div`
  padding: 1.25rem;
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => theme.colors.surface};
  box-shadow: ${({ theme }) => theme.shadows.small};
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
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const SearchContainer = styled.div`
  padding: 1rem;
  border-bottom: 1px solid #E4E8EB;
  background-color: #ffffff;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 0.75rem 1rem;
  background-color: #F5F7FB;
  border: 1px solid #E4E8EB;
  border-radius: 8px;
  color: #1A1D1F;
  
  &::placeholder {
    color: #98A2B3;
  }

  &:focus {
    outline: none;
    border-color: #6366F1;
  }
`;

const UsersList = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  background-color: #ffffff;
`;

const UserItem = styled(motion.div)<{ selected: boolean }>`
  display: flex;
  align-items: center;
  padding: 0.75rem;
  border-radius: ${({ theme }) => theme.borderRadius.large};
  cursor: pointer;
  background-color: ${({ selected, theme }) => 
    selected ? `${theme.colors.background}CC` : 'transparent'};
  margin-bottom: 0.25rem;
  transition: all ${({ theme }) => theme.transitions.fast};
  backdrop-filter: ${({ selected }) => selected ? 'blur(8px)' : 'none'};

  &:hover {
    background-color: ${({ theme }) => `${theme.colors.background}CC`};
    transform: translateX(4px) scale(1.02);
    backdrop-filter: blur(8px);
  }
`;

const UserAvatar = styled.div<{ $small?: boolean }>`
  width: ${({ $small }) => $small ? '32px' : '40px'};
  height: ${({ $small }) => $small ? '32px' : '40px'};
  border-radius: ${({ theme }) => theme.borderRadius.round};
  background: linear-gradient(135deg, 
    ${({ theme }) => theme.colors.primary} 0%,
    ${({ theme }) => theme.colors.primaryDark} 100%);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: ${({ $small }) => $small ? '0.875rem' : '1rem'};
  font-weight: 600;
  margin-right: 0.75rem;
  box-shadow: ${({ theme }) => theme.shadows.small};
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    transform: scale(1.05);
    box-shadow: ${({ theme }) => theme.shadows.medium};
  }
`;

const UserInfo = styled.div`
  flex: 1;
`;

const UserNameContainer = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
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
  background-color: ${({ theme }) => `${theme.colors.surface}CC`};
  backdrop-filter: blur(8px);
  animation: fadeScale 0.4s ease-out;

  @keyframes fadeScale {
    from { 
      opacity: 0;
      transform: scale(0.98);
    }
    to { 
      opacity: 1;
      transform: scale(1);
    }
  }
`;

const ChatHeader = styled.div`
  padding: 1rem 1.5rem;
  border-bottom: 1px solid ${({ theme }) => `${theme.colors.border}80`};
  display: flex;
  justify-content: space-between;
  align-items: center;
  background-color: ${({ theme }) => `${theme.colors.surface}CC`};
  backdrop-filter: blur(8px);
  z-index: 2;
`;

const IconButton = styled.button`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.25rem;
  padding: 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.round};
  transition: all ${({ theme }) => theme.transitions.fast};
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.background};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const BackButton = styled(IconButton)`
  margin-right: 0.5rem;
  
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.background};
  }
`;

const ChatWithUserContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const Title = styled.h2`
  margin-left: auto;
  color: ${({ theme }) => theme.colors.text};
`;

const MessagesContainer = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  background-color: #F5F7FB;
  scroll-behavior: smooth;
`;

const MessageBubble = styled(motion.div)<{ sent: boolean; selected?: boolean; selectable?: boolean }>`
  max-width: 65%;
  padding: 0.75rem 1rem;
  border-radius: ${({ sent }) => sent ? '16px 16px 0 16px' : '16px 16px 16px 0'};
  background-color: ${({ sent, theme }) => 
    sent ? `${theme.colors.primary}15` : '#ffffff'};
  color: ${({ sent, theme }) => 
    sent ? theme.colors.text : theme.colors.primary};
  align-self: ${({ sent }) => (sent ? 'flex-end' : 'flex-start')};
  box-shadow: ${({ theme }) => theme.shadows.small};
  position: relative;
  border: 1px solid ${({ sent, theme }) => 
    sent ? `${theme.colors.primary}30` : `${theme.colors.border}30`};
  backdrop-filter: blur(4px);
  will-change: transform;
  transform-origin: ${({ sent }) => sent ? 'right' : 'left'};
  transition: all ${({ theme }) => theme.transitions.fast} cubic-bezier(0.4, 0, 0.2, 1);
  
  ${({ selected, theme }) => selected && `
    background-color: ${theme.colors.primary}30;
    border-color: ${theme.colors.primary};
    transform: scale(1.02);
  `}

  &:hover {
    transform: ${({ selectable }) => selectable ? 'scale(1.02)' : 'none'};
    box-shadow: ${({ theme }) => theme.shadows.medium};
  }

  @keyframes slideLeft {
    from { 
      opacity: 0;
      transform: translateX(15px);
    }
    to { 
      opacity: 1;
      transform: translateX(0);
    }
  }

  @keyframes slideRight {
    from { 
      opacity: 0;
      transform: translateX(-15px);
    }
    to { 
      opacity: 1;
      transform: translateX(0);
    }
  }

  animation: ${({ sent }) => sent ? 'slideLeft 0.2s ease-out' : 'slideRight 0.2s ease-out'};
`;

const MessageText = styled.div`
  color: inherit;
  margin-bottom: 0.5rem;
  line-height: 1.4;
`;

const MessageTime = styled.div`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.75rem;
  opacity: 0.8;
`;

const MessageForm = styled.form`
  padding: 1rem 1.5rem;
  display: flex;
  gap: 1rem;
  align-items: center;
  background-color: ${({ theme }) => `${theme.colors.surface}CC`};
  border-top: 1px solid ${({ theme }) => `${theme.colors.border}80`};
  backdrop-filter: blur(8px);
  z-index: 2;
`;

const MessageInput = styled.input`
  flex: 1;
  padding: 0.75rem 1rem;
  border-radius: 24px;
  background-color: ${({ theme }) => `${theme.colors.background}CC`};
  border: 1px solid ${({ theme }) => `${theme.colors.border}80`};
  color: ${({ theme }) => theme.colors.text};
  backdrop-filter: blur(4px);
  transition: all ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
    box-shadow: 0 0 0 3px ${({ theme }) => `${theme.colors.primary}20`};
    transform: scale(1.01);
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const SendButton = styled(motion.button)`
  padding: 0.75rem;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all ${({ theme }) => theme.transitions.fast};
  box-shadow: ${({ theme }) => theme.shadows.medium};

  svg {
    font-size: 1.25rem;
    transform: translateX(1px);
  }

  &:hover {
    background-color: ${({ theme }) => theme.colors.primaryDark};
    transform: scale(1.05);
    box-shadow: ${({ theme }) => theme.shadows.large};
  }

  &:active {
    transform: scale(0.95);
  }

  &:disabled {
    background-color: ${({ theme }) => theme.colors.border};
    cursor: not-allowed;
    box-shadow: none;

    svg {
      color: ${({ theme }) => theme.colors.textSecondary};
    }
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
  text-align: center;
  padding: 2rem;

  h2 {
    ${({ theme }) => theme.typography.h2};
    color: ${({ theme }) => theme.colors.text};
    margin-bottom: 0.5rem;
  }

  p {
    ${({ theme }) => theme.typography.body};
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const HeaderActions = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
`;

const MessageInfo = styled.div`
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 0.4rem;
  opacity: 0.9;
`;

const MessageStatus = styled.div`
  display: flex;
  align-items: center;
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 0.875rem;
  padding-left: 0.25rem;

  svg {
    width: 16px;
    height: 16px;
    &:last-child {
      margin-left: -6px;
    }
  }

  &.read {
    color: ${({ theme }) => theme.colors.success};
  }
`;

const TypingIndicator = styled.span`
  color: ${({ theme }) => theme.colors.primary};
  font-size: 0.875rem;
  font-style: italic;
  opacity: 0.8;
  animation: fadeInOut 1.5s infinite;

  @keyframes fadeInOut {
    0% { opacity: 0.4; }
    50% { opacity: 0.8; }
    100% { opacity: 0.4; }
  }
`;

const EmojiPickerWrapper = styled.div`
  position: relative;
`;

const EmojiPickerContainer = styled.div`
  position: absolute;
  bottom: 100%;
  right: 0;
  margin-bottom: 10px;
  z-index: 1000;
  box-shadow: ${({ theme }) => theme.shadows.large};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  overflow: hidden;

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
    right: 15px;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid ${({ theme }) => theme.colors.surface};
  }
`;

const EmojiButton = styled.button`
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.4rem;
  padding: 0.7rem;
  border-radius: ${({ theme }) => theme.borderRadius.round};
  transition: all ${({ theme }) => theme.transitions.fast};
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: transparent;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.background};
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }
`;

const UnreadBadge = styled.div`
  background: linear-gradient(135deg, 
    ${({ theme }) => theme.colors.primary} 0%,
    ${({ theme }) => theme.colors.primaryDark} 100%);
  color: white;
  font-size: 0.75rem;
  padding: 0.25rem 0.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.xl};
  min-width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  box-shadow: ${({ theme }) => theme.shadows.small};
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

const ShortcutWrapper = styled.div`
  position: relative;
`;

const ShortcutButton = styled(EmojiButton)`
  svg {
    transform: rotate(-45deg);
  }
`;

const ShortcutMenu = styled.div`
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 10px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  box-shadow: ${({ theme }) => theme.shadows.large};
  min-width: 200px;
  overflow: hidden;
  z-index: 1000;

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

const ShortcutItem = styled.button`
  width: 100%;
  padding: 0.75rem 1rem;
  text-align: left;
  color: ${({ theme }) => theme.colors.text};
  transition: all ${({ theme }) => theme.transitions.fast};
  border-bottom: 1px solid ${({ theme }) => theme.colors.border};

  &:hover {
    background-color: ${({ theme }) => theme.colors.background};
  }

  &:last-child {
    border-bottom: none;
  }
`;

export default Chat; 