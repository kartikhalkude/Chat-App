import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import Peer from 'simple-peer/simplepeer.min.js';

interface XirsysResponse {
  format: string;
  v: {
    iceServers?: Array<{
      urls: string[];
      username?: string;
      credential?: string;
    }>;
    urls?: string | string[];
    username?: string;
    credential?: string;
    iceTransportPolicy?: string;
  };
  s: string;
}

interface VideoCallProps {
  socket: any;
  selectedUser: string;
  currentUser: string;
  onClose: () => void;
  isReceivingCall?: boolean;
  signal?: any;
}

const getIceServers = async () => {
  try {
    const response = await fetch('https://global.xirsys.net/_turn/MyFirstApp', {
      method: 'PUT',
      headers: {
        'Authorization': 'Basic ' + btoa('kartik:14120456-ef8f-11ef-9c6d-0242ac150003'),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        format: "urls",
        timeout: 60
      })
    });

    const data = await response.json() as XirsysResponse;
    console.log('Raw Xirsys response:', data);

    let iceServers = [];

    // Improved parsing logic
    if (data && data.s === 'ok' && data.v) {
      if (data.v.iceServers) {
        // Standard format
        iceServers = data.v.iceServers;
      } else if (data.v.urls) {
        // Handle different response structure - common Xirsys format
        iceServers = [{
          urls: Array.isArray(data.v.urls) ? data.v.urls : [data.v.urls],
          ...(data.v.username && { username: data.v.username }),
          ...(data.v.credential && { credential: data.v.credential })
        }];
      }
    }

    if (!iceServers.length) {
      console.warn('No ICE servers found in Xirsys response, using fallback servers');
    }

    console.log('Processed Xirsys servers:', iceServers);

    // Always include fallback STUN servers
    const fallbackServers = [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302',
          'stun:stun3.l.google.com:19302',
          'stun:stun4.l.google.com:19302'
        ]
      }
    ];

    const finalServers = [...iceServers, ...fallbackServers];
    console.log('Final ICE configuration:', finalServers);
    return finalServers;

  } catch (error) {
    console.error('Error fetching ICE servers:', error);
    return [
      {
        urls: [
          'stun:stun1.l.google.com:19302',
          'stun:stun2.l.google.com:19302'
        ]
      }
    ];
  }
};

const VideoCall: React.FC<VideoCallProps> = ({
  socket,
  selectedUser,
  currentUser,
  onClose,
  isReceivingCall,
  signal
}) => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [iceServers, setIceServers] = useState<RTCIceServer[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'failed'>('connecting');
  const [isCallEnding, setIsCallEnding] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<any>();
  const streamRef = useRef<MediaStream | null>(null);
  const signalDataRef = useRef<any>(null);

  // Complete cleanup function
  const completeCleanup = useCallback(() => {
    setIsCallEnding(true);
    console.log('Performing complete cleanup');
    
    // Clean up peer connection
    if (connectionRef.current) {
      console.log('Destroying peer connection');
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    // Clean up media streams
    if (streamRef.current) {
      console.log('Stopping media tracks');
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Track ${track.kind} stopped: ${track.readyState}`);
      });
      streamRef.current = null;
    }

    // Clear video elements
    if (myVideo.current) myVideo.current.srcObject = null;
    if (userVideo.current) userVideo.current.srcObject = null;

    setStream(null);
    setCallAccepted(false);
  }, []);

  // Set up media stream
  useEffect(() => {
    let mounted = true;

    const setupStream = async () => {
      try {
        console.log('Requesting media devices...');
        const mediaStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });

        if (!mounted) {
          console.log('Component unmounted during getUserMedia, cleaning up stream');
          mediaStream.getTracks().forEach(track => track.stop());
          return;
        }

        console.log('Media stream obtained successfully');
        streamRef.current = mediaStream;
        setStream(mediaStream);
        
        if (myVideo.current) {
          myVideo.current.srcObject = mediaStream;
        }
      } catch (error) {
        console.error('Error accessing media devices:', error);
        onClose();
      }
    };

    setupStream();

    return () => {
      mounted = false;
      completeCleanup();
    };
  }, []);

  // Fetch ICE servers
  useEffect(() => {
    const fetchIceServers = async () => {
      console.log('Fetching ICE servers...');
      const servers = await getIceServers();
      setIceServers(servers);
    };
    fetchIceServers();
  }, []);

  // Setup call once we have both stream and ICE servers
  useEffect(() => {
    if (!stream || !iceServers.length || isCallEnding || setupComplete) return;

    console.log('Call setup prerequisites met, preparing connection...');
    setSetupComplete(true);
    
    const setupCall = () => {
      if (isReceivingCall && signal) {
        console.log('Preparing to answer incoming call');
        signalDataRef.current = signal;
        answerCall();
      } else if (!isReceivingCall) {
        console.log('Preparing to initiate outgoing call');
        callUser();
      }
    };

    // Add a slight delay to ensure everything is initialized
    const timer = setTimeout(setupCall, 1000);
    return () => clearTimeout(timer);
  }, [stream, iceServers, isReceivingCall, signal, isCallEnding, setupComplete]);

  // Handle remote call end
  useEffect(() => {
    if (!socket) return;

    console.log('Setting up socket event listeners');
    
    const handleEndCall = () => {
      console.log('Received end call request from remote peer');
      completeCleanup();
      onClose();
    };

    socket.on('endCall', handleEndCall);

    return () => {
      console.log('Removing socket event listeners');
      socket.off('endCall', handleEndCall);
    };
  }, [socket, onClose, completeCleanup]);

  const createPeerConnection = useCallback((isInitiator: boolean) => {
    if (!stream || !iceServers.length || isCallEnding) {
      console.log('Cannot create peer: prerequisites not met');
      return null;
    }

    try {
      console.log(`Creating ${isInitiator ? 'initiator' : 'receiver'} peer connection`);
      console.log('Using ICE servers:', iceServers);
      
      const peer = new Peer({
        initiator: isInitiator,
        trickle: true,
        stream,
        config: {
          iceServers: iceServers,
          iceTransportPolicy: 'all',
          iceCandidatePoolSize: 10,
          bundlePolicy: 'max-bundle',
          rtcpMuxPolicy: 'require'
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Peer connection error:', err);
        if (!isCallEnding) {
          setConnectionStatus('failed');
          setTimeout(() => onClose(), 2000);
        }
      });

      peer.on('connect', () => {
        console.log('Peer connection established');
        setConnectionStatus('connected');
      });

      peer.on('signal', (data: any) => {
        console.log('Generated signal data of type:', data.type);
      });

      peer.on('iceStateChange', (state: string) => {
        console.log('ICE state changed to:', state);
        if (state === 'connected') {
          setConnectionStatus('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          if (!isCallEnding) {
            console.warn(`ICE state ${state} indicates potential connection issues`);
            if (state === 'failed') {
              setConnectionStatus('failed');
            }
          }
        }
      });

      return peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      if (!isCallEnding) {
        setConnectionStatus('failed');
      }
      return null;
    }
  }, [stream, iceServers, isCallEnding, onClose]);

  const callUser = () => {
    console.log('Initiating call to user:', selectedUser);
    const peer = createPeerConnection(true);
    if (!peer) {
      console.error('Failed to create peer connection for outgoing call');
      return;
    }

    peer.on('signal', (data: any) => {
      console.log('Sending signal to user:', selectedUser);
      socket.emit('callUser', {
        userToCall: selectedUser,
        signalData: data,
        from: currentUser,
      });
    });

    peer.on('stream', (remoteStream: MediaStream) => {
      console.log('Received remote stream');
      if (userVideo.current) {
        userVideo.current.srcObject = remoteStream;
      }
    });

    socket.on('callAccepted', (incomingSignal: any) => {
      try {
        console.log('Call accepted, processing incoming signal');
        peer.signal(incomingSignal);
        setCallAccepted(true);
      } catch (error) {
        console.error('Error handling incoming signal:', error);
        setConnectionStatus('failed');
        setTimeout(() => onClose(), 2000);
      }
    });

    connectionRef.current = peer;
  };

  const answerCall = () => {
    if (!stream || !signalDataRef.current) {
      console.error('Cannot answer call, missing stream or signal data');
      return;
    }

    console.log('Answering incoming call from:', selectedUser);
    const peer = createPeerConnection(false);
    if (!peer) {
      console.error('Failed to create peer connection for incoming call');
      return;
    }

    peer.on('signal', (data: any) => {
      console.log('Sending answer signal to:', selectedUser);
      socket.emit('answerCall', { signal: data, to: selectedUser });
    });

    peer.on('stream', (remoteStream: MediaStream) => {
      console.log('Received remote stream from caller');
      if (userVideo.current) {
        userVideo.current.srcObject = remoteStream;
      }
    });

    try {
      console.log('Processing incoming signal for answering call');
      peer.signal(signalDataRef.current);
      setCallAccepted(true);
    } catch (error) {
      console.error('Error signaling peer for incoming call:', error);
      setConnectionStatus('failed');
      setTimeout(() => onClose(), 2000);
    }

    connectionRef.current = peer;
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        console.log(`Microphone ${audioTrack.enabled ? 'unmuted' : 'muted'}`);
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
        console.log(`Camera ${videoTrack.enabled ? 'enabled' : 'disabled'}`);
      }
    }
  };

  // Improved end call function with thorough cleanup
  const endCall = () => {
    try {
      console.log('Ending call with user:', selectedUser);
      // First notify the other user
      socket.emit('endCall', { user: selectedUser });
      // Then do a complete cleanup of all resources
      completeCleanup();
    } catch (error) {
      console.error('Error ending call:', error);
    } finally {
      // Always call onClose to return to previous UI
      console.log('Closing call UI');
      onClose();
    }
  };

  return (
    <Container
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <ConnectionStatus status={connectionStatus}>
        {connectionStatus === 'connecting' && 'Establishing connection...'}
        {connectionStatus === 'connected' && 'Connected'}
        {connectionStatus === 'failed' && 'Connection failed'}
      </ConnectionStatus>

      <VideoGrid>
        <VideoContainer>
          <Video
            playsInline
            muted
            ref={myVideo}
            autoPlay
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
          />
          <VideoLabel>You</VideoLabel>
        </VideoContainer>

        {callAccepted && (
          <VideoContainer>
            <Video
              playsInline
              ref={userVideo}
              autoPlay
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
            />
            <VideoLabel>{selectedUser}</VideoLabel>
          </VideoContainer>
        )}
      </VideoGrid>

      <Controls>
        <ControlButton onClick={toggleMute}>
          {isMuted ? <FiMicOff /> : <FiMic />}
        </ControlButton>
        <EndCallButton onClick={endCall}>
          <FiPhoneOff />
        </EndCallButton>
        <ControlButton onClick={toggleVideo}>
          {isVideoEnabled ? <FiVideo /> : <FiVideoOff />}
        </ControlButton>
      </Controls>
    </Container>
  );
};

const Container = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: ${({ theme }) => theme.colors.background};
  z-index: 1000;
  display: flex;
  flex-direction: column;
  padding: 2rem;
`;

const ConnectionStatus = styled.div<{ status: string }>`
  position: fixed;
  top: 1rem;
  left: 50%;
  transform: translateX(-50%);
  padding: 0.5rem 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  background-color: ${({ theme, status }) => 
    status === 'connected' ? theme.colors.success :
    status === 'failed' ? theme.colors.error :
    theme.colors.surface};
  color: white;
  font-size: 0.875rem;
  z-index: 1001;
`;

const VideoGrid = styled.div`
  flex: 1;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 2rem;
  align-items: center;
  justify-items: center;
  padding: 2rem;
`;

const VideoContainer = styled.div`
  position: relative;
  width: 100%;
  max-width: 600px;
  aspect-ratio: 16/9;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius.large};
  overflow: hidden;
`;

const Video = styled(motion.video)`
  width: 100%;
  height: 100%;
  object-fit: cover;
`;

const VideoLabel = styled.div`
  position: absolute;
  bottom: 1rem;
  left: 1rem;
  color: white;
  background-color: rgba(0, 0, 0, 0.5);
  padding: 0.5rem 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  font-size: 0.875rem;
`;

const Controls = styled.div`
  display: flex;
  justify-content: center;
  gap: 2rem;
  padding: 2rem;
`;

const ControlButton = styled.button`
  width: 4rem;
  height: 4rem;
  border-radius: ${({ theme }) => theme.borderRadius.round};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
  transition: all ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme }) => theme.colors.border};
  }
`;

const EndCallButton = styled(ControlButton)`
  background-color: ${({ theme }) => theme.colors.error};
  color: white;

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}dd;
  }
`;

export default VideoCall;
