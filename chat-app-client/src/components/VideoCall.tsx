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
  
  const myVideo = useRef<HTMLVideoElement>(null);
  const userVideo = useRef<HTMLVideoElement>(null);
  const connectionRef = useRef<any>();

  useEffect(() => {
    // Request camera and microphone permissions
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      .then((currentStream) => {
        setStream(currentStream);
        if (myVideo.current) {
          myVideo.current.srcObject = currentStream;
        }
      })
      .catch((error) => {
        console.error('Error accessing media devices:', error);
        onClose(); // Close the call if we can't access media devices
      });

    return () => {
      // Cleanup: stop all tracks when component unmounts
      stream?.getTracks().forEach(track => track.stop());
      if (connectionRef.current) {
        connectionRef.current.destroy();
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

    // Small delay to ensure proper initialization
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
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
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
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      });

      // Remove any existing listeners before adding new ones
      socket.off('callAccepted');
      socket.on('callAccepted', (incomingSignal: any) => {
        try {
          peer.signal(incomingSignal);
          setCallAccepted(true);
        } catch (error) {
          console.error('Error handling incoming signal:', error);
          onClose();
        }
      });

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error creating peer connection:', error);
      onClose();
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
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' }
          ]
        }
      });

      peer.on('signal', (data) => {
        socket.emit('answerCall', { signal: data, to: selectedUser });
      });

      peer.on('stream', (remoteStream) => {
        if (userVideo.current) {
          userVideo.current.srcObject = remoteStream;
        }
      });

      peer.on('error', (err) => {
        console.error('Peer connection error:', err);
        onClose();
      });

      try {
        peer.signal(signal);
        setCallAccepted(true);
      } catch (error) {
        console.error('Error signaling peer:', error);
        onClose();
      }

      connectionRef.current = peer;
    } catch (error) {
      console.error('Error answering call:', error);
      onClose();
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
    try {
      if (connectionRef.current) {
        connectionRef.current.destroy();
      }
      stream?.getTracks().forEach(track => track.stop());
      socket.emit('endCall', { user: selectedUser });
    } catch (error) {
      console.error('Error ending call:', error);
    } finally {
      onClose();
    }
  };

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