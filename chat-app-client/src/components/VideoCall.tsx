import React, { useEffect, useRef, useState, useCallback } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import Peer from 'simple-peer/simplepeer.min.js';
import { playRingtone, stopRingtone, testAudio } from '../utils/audioUtils';

interface XirsysResponse {
  format: string;
  v: {
    iceServers: Array<{
      urls: string[];
      username?: string;
      credential?: string;
    }>;
    iceTransportPolicy: string;
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
      body: JSON.stringify({ format: "urls" })
    });

    const data = await response.json();
    console.log('Xirsys response:', data); // Debug log

    // Check if data has the expected structure
    if (data && data.v && Array.isArray(data.v.iceServers)) {
      return data.v.iceServers;
    } else if (data && Array.isArray(data.iceServers)) {
      return data.iceServers;
    } else {
      console.warn('Unexpected Xirsys response format, using fallback servers');
      throw new Error('Invalid ICE servers format');
    }
  } catch (error) {
    console.error('Error fetching ICE servers:', error);
    // Return fallback STUN servers
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
  const [connectionStatus, setConnectionStatus] = useState<'new' | 'connecting' | 'connected' | 'failed'>('new');
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<any>();
  const streamRef = useRef<MediaStream | null>(null);
  const cleanupTimeoutRef = useRef<NodeJS.Timeout>();

  const completeCleanup = useCallback(() => {
    // Stop ringtone
    stopRingtone();

    // Stop all tracks in the local stream
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => {
        track.stop();
        console.log(`Local track ${track.kind} stopped: ${track.readyState}`);
      });
      streamRef.current = null;
    }

    // Stop all tracks in the remote stream
    if (userVideo.current?.srcObject instanceof MediaStream) {
      const remoteStream = userVideo.current.srcObject as MediaStream;
      remoteStream.getTracks().forEach(track => {
        track.stop();
        console.log(`Remote track ${track.kind} stopped: ${track.readyState}`);
      });
      userVideo.current.srcObject = null;
    }

    // Clear video elements
    if (myVideo.current) {
      const localStream = myVideo.current.srcObject as MediaStream;
      if (localStream) {
        localStream.getTracks().forEach(track => {
          track.stop();
          console.log(`Local video track ${track.kind} stopped: ${track.readyState}`);
        });
      }
      myVideo.current.srcObject = null;
    }

    // Destroy peer connection
    if (connectionRef.current) {
      connectionRef.current.destroy();
      connectionRef.current = null;
    }

    // Reset states
    setStream(null);
    setCallAccepted(false);
    setConnectionStatus('new');
  }, []);

  // Fetch ICE servers when component mounts
  useEffect(() => {
    const fetchIceServers = async () => {
      const servers = await getIceServers();
      setIceServers(servers);
    };
    fetchIceServers();
  }, []);

  // Set up media stream with proper tracking
  useEffect(() => {
    let mounted = true;

    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((mediaStream) => {
        if (!mounted) {
          // Component unmounted before promise resolved, clean up the stream
          mediaStream.getTracks().forEach(track => {
            track.stop();
            console.log(`Media track cleanup: ${track.kind} stopped`);
          });
          return;
        }
        
        // Store stream in ref for cleanup access
        streamRef.current = mediaStream;
        setStream(mediaStream);
        
        if (myVideo.current) {
          myVideo.current.srcObject = mediaStream;
        }
      })
      .catch((error) => {
        console.error('Error accessing media devices:', error);
        onClose();
      });

    // Cleanup function
    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => {
          track.stop();
          console.log(`Cleanup: ${track.kind} track stopped`);
        });
        streamRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!stream || !iceServers.length) return;

    const setupCall = () => {
      if (isReceivingCall && signal) {
        answerCall();
      } else if (!isReceivingCall) {
        callUser();
      }
    };

    const timer = setTimeout(setupCall, 500);
    return () => clearTimeout(timer);
  }, [stream, iceServers, isReceivingCall, signal]);

  // Handle remote call end
  useEffect(() => {
    socket.on('endCall', () => {
      completeCleanup();
      onClose();
    });

    return () => {
      socket.off('endCall');
    };
  }, [socket, onClose]);

  // Test audio capability when component mounts
  useEffect(() => {
    const testAudioPlayback = async () => {
      const canPlayAudio = await testAudio();
      if (!canPlayAudio) {
        console.warn('Audio playback may not work without user interaction');
      }
    };
    testAudioPlayback();
  }, []);

  // Update the ringtone effect
  useEffect(() => {
    let mounted = true;

    const handleRingtone = async () => {
      if (isReceivingCall && mounted) {
        try {
          await playRingtone();
          console.log('Ringtone started');
        } catch (error) {
          console.error('Failed to play ringtone:', error);
        }
      }
    };

    handleRingtone();

    return () => {
      mounted = false;
      stopRingtone();
    };
  }, [isReceivingCall]);

  // Add socket event listeners for call status
  useEffect(() => {
    if (!socket) return;

    const handleCallEnded = () => {
      console.log('Call ended by remote peer');
      completeCleanup();
      onClose();
    };

    socket.on('callEnded', handleCallEnded);

    return () => {
      socket.off('callEnded', handleCallEnded);
    };
  }, [socket]);

  const createPeerConnection = (isInitiator: boolean) => {
    if (!stream || !iceServers.length) return null;

    try {
      const peer = new Peer({
        initiator: isInitiator,
        trickle: false,
        stream,
        config: {
          iceServers: iceServers,
          iceTransportPolicy: 'all'
        },
        sdpTransform: (sdp: string) => {
          // Ensure proper SDP negotiation
          return sdp;
        }
      });

      peer.on('error', (err: Error) => {
        console.error('Peer connection error:', err);
        if (err.toString().includes('ICE connection failed')) {
          console.log('ICE connection failed - trying to reconnect...');
          setConnectionStatus('failed');
        }
        // Don't call onClose here, let the error be handled by the caller
      });

      peer.on('connect', () => {
        console.log('Peer connection established');
        setConnectionStatus('connected');
        // Stop ringtone when connection is established
        stopRingtone();
      });

      peer.on('close', () => {
        console.log('Peer connection closed');
        completeCleanup();
        onClose();
      });

      peer.on('iceStateChange', (state: string) => {
        console.log('ICE state:', state);
        if (state === 'connected') {
          setConnectionStatus('connected');
        } else if (state === 'failed' || state === 'disconnected' || state === 'closed') {
          setConnectionStatus('failed');
        }
      });

      return peer;
    } catch (error) {
      console.error('Error creating peer:', error);
      setConnectionStatus('failed');
      return null;
    }
  };

  const callUser = () => {
    try {
      const peer = createPeerConnection(true);
      if (!peer) return;

      peer.on('signal', (data: any) => {
        socket.emit('callUser', {
          userToCall: selectedUser,
          signalData: data,
          from: currentUser,
        });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
          // Stop ringtone when stream is received
          stopRingtone();
        }
      });

      socket.on('callAccepted', (incomingSignal: any) => {
        try {
          if (peer.destroyed) {
            console.log('Peer was destroyed before accepting call');
            return;
          }
          peer.signal(incomingSignal);
          setCallAccepted(true);
          // Stop ringtone when call is accepted
          stopRingtone();
        } catch (error) {
          console.error('Error handling incoming signal:', error);
          setConnectionStatus('failed');
          peer.destroy();
          onClose();
        }
      });

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error in callUser:', error);
      onClose();
    }
  };

  const answerCall = () => {
    try {
      if (!stream || !signal) {
        console.error('Missing stream or signal for answering call');
        return;
      }

      const peer = createPeerConnection(false);
      if (!peer) return;

      peer.on('signal', (data: any) => {
        socket.emit('answerCall', { signal: data, to: selectedUser });
      });

      peer.on('stream', (remoteStream: MediaStream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
          // Stop ringtone when stream is received
          stopRingtone();
        }
      });

      try {
        if (!peer.destroyed) {
          peer.signal(signal);
          setCallAccepted(true);
          // Stop ringtone when answering call
          stopRingtone();
        } else {
          console.log('Peer was destroyed before answering call');
        }
      } catch (error) {
        console.error('Error signaling peer:', error);
        setConnectionStatus('failed');
        peer.destroy();
        onClose();
      }

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error in answerCall:', error);
      onClose();
    }
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoEnabled(videoTrack.enabled);
      }
    }
  };

  // Improved end call function with thorough cleanup
  const endCall = () => {
    try {
      stopRingtone();
      socket.emit('endCall', { user: selectedUser });
      completeCleanup();
    } catch (error) {
      console.error('Error ending call:', error);
    } finally {
      onClose();
    }
  };

  useEffect(() => {
    if (connectionStatus === 'failed') {
      // Add a small delay before cleanup to allow for potential recovery
      cleanupTimeoutRef.current = setTimeout(() => {
        completeCleanup();
        onClose();
      }, 1000);
    }
    return () => {
      if (cleanupTimeoutRef.current) {
        clearTimeout(cleanupTimeoutRef.current);
      }
    };
  }, [connectionStatus]);

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