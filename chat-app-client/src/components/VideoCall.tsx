import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { FiPhoneOff, FiMic, FiMicOff, FiVideo, FiVideoOff } from 'react-icons/fi';
import Peer from 'simple-peer/simplepeer.min.js';

interface VideoCallProps {
  socket: any;
  selectedUser: string;
  currentUser: string;
  onClose: () => void;
  isReceivingCall?: boolean;
  signal?: any;
}

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
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<any>();
  const streamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);

  const cleanupMediaStream = () => {
    console.log('Starting media stream cleanup...');

    // Helper function to safely cleanup a stream
    const cleanupStream = (stream: MediaStream | null, label: string) => {
      if (stream) {
        const tracks = stream.getTracks();
        tracks.forEach(track => {
          // First disable the track
          track.enabled = false;
          // Then stop it
          track.stop();
          stream.removeTrack(track);
          console.log(`Stopped ${label} track: ${track.kind}, ID: ${track.id}, Enabled: ${track.enabled}`);
        });
        return null;
      }
      return null;
    };

    // Clean up the local stream reference
    streamRef.current = cleanupStream(streamRef.current, 'local');

    // Clean up the remote stream reference
    remoteStreamRef.current = cleanupStream(remoteStreamRef.current, 'remote');

    // Clean up video elements
    if (myVideo.current && myVideo.current.srcObject) {
      const stream = myVideo.current.srcObject as MediaStream;
      cleanupStream(stream, 'myVideo');
      myVideo.current.srcObject = null;
      console.log('Cleaned up myVideo element');
    }

    if (userVideo.current && userVideo.current.srcObject) {
      const stream = userVideo.current.srcObject as MediaStream;
      cleanupStream(stream, 'userVideo');
      userVideo.current.srcObject = null;
      console.log('Cleaned up userVideo element');
    }

    // Clean up the state stream
    if (stream) {
      cleanupStream(stream, 'state');
      setStream(null);
    }

    console.log('Media stream cleanup completed');
  };

  useEffect(() => {
    // Fetch ICE servers first
    const fetchIceServers = async () => {
      try {
        const response = await fetch('/api/ice-servers');
        const data = await response.json();
        console.log('ICE servers response:', data);
        
        if (data.iceServers && Array.isArray(data.iceServers)) {
          console.log('Using ICE servers:', data.iceServers);
          setIceServers(data.iceServers);
        } else {
          console.error('Invalid ICE servers format:', data);
          // Fallback to default STUN servers
          setIceServers([
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch ICE servers:', error);
        // Fallback to default STUN servers
        setIceServers([
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:global.stun.twilio.com:3478' }
        ]);
      }
    };

    fetchIceServers();

    // Request camera and microphone permissions
    navigator.mediaDevices.getUserMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }, 
      audio: true 
    })
      .then((currentStream) => {
        setStream(currentStream);
        streamRef.current = currentStream;
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }
      })
      .catch((error) => {
        console.error('Error accessing media devices:', error);
        onClose();
      });

    return () => {
      cleanupMediaStream();
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
      }
      socket.off('callAccepted');
      socket.off('callEnded');
    };
  }, []);

  useEffect(() => {
    if (!stream) return;

    const setupCall = () => {
      if (isReceivingCall && signal) {
        answerCall();
      } else if (!isReceivingCall) {
        callUser();
      }
    };

    const timer = setTimeout(setupCall, 100);
    return () => clearTimeout(timer);
  }, [stream]);

  const callUser = () => {
    if (!stream) return;

    try {
      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream,
        config: {
          iceServers
        }
      });

      peer.on('signal', (data) => {
        socket.emit('callUser', {
          userToCall: selectedUser,
          signalData: data,
          from: currentUser,
        });
      });

      peer.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream;
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      });

      socket.off('callAccepted');
      socket.on('callAccepted', (incomingSignal: any) => {
        try {
          peer.signal(incomingSignal);
          setCallAccepted(true);
        } catch (error) {
          console.error('Error handling incoming signal:', error);
          endCall();
        }
      });

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      endCall();
    }
  };

  const answerCall = () => {
    if (!stream || !signal) return;

    try {
      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream,
        config: {
          iceServers
        }
      });

      peer.on('signal', (data) => {
        socket.emit('answerCall', { signal: data, to: selectedUser });
      });

      peer.on('stream', (remoteStream) => {
        remoteStreamRef.current = remoteStream;
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      });

      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        endCall();
      });

      try {
        peer.signal(signal);
        setCallAccepted(true);
      } catch (error) {
        console.error('Error signaling peer:', error);
        endCall();
      }

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error answering call:', error);
      endCall();
    }
  };

  const toggleMute = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      audioTrack.enabled = !audioTrack.enabled;
      setIsMuted(!audioTrack.enabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      videoTrack.enabled = !videoTrack.enabled;
      setIsVideoEnabled(videoTrack.enabled);
    }
  };

  const endCall = () => {
    console.log('Initiating call end process...');
    
    try {
      // First, ensure all media is turned off
      if (stream) {
        stream.getTracks().forEach(track => {
          track.enabled = false;
        });
      }

      // Destroy the peer connection
      if (connectionRef.current) {
        connectionRef.current.destroy();
        connectionRef.current = null;
        console.log('Peer connection destroyed');
      }

      // Clean up all media streams
      cleanupMediaStream();

      // Notify the other user to also cleanup their streams
      socket.emit('endCall', { user: selectedUser });
      
      // Reset all state
      setCallAccepted(false);
      setIsMuted(false);
      setIsVideoEnabled(false);

    } catch (error) {
      console.error('Error during call end:', error);
    } finally {
      // Ensure one final cleanup attempt before closing
      try {
        cleanupMediaStream();
      } catch (e) {
        console.error('Final cleanup attempt failed:', e);
      }
      onClose();
    }
  };

  // Add effect to handle incoming endCall event
  useEffect(() => {
    socket.on('endCall', () => {
      console.log('Received endCall event from peer');
      endCall();
    });

    return () => {
      socket.off('endCall');
    };
  }, [socket]);

  return (
    <Container
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
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