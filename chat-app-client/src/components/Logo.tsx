import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FiMessageCircle } from 'react-icons/fi';

interface LogoProps {
  size?: 'small' | 'medium' | 'large';
  showText?: boolean;
}

const Logo: React.FC<LogoProps> = ({ size = 'medium', showText = true }) => {
  const iconVariants = {
    initial: { scale: 0, rotate: -45 },
    animate: { 
      scale: 1, 
      rotate: 0,
      transition: {
        type: "spring",
        stiffness: 260,
        damping: 20,
        duration: 0.6
      }
    },
    hover: { 
      scale: 1.1,
      rotate: 5,
      transition: { 
        type: "spring", 
        stiffness: 400, 
        damping: 10 
      }
    }
  };

  const textVariants = {
    initial: { opacity: 0, x: -20 },
    animate: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: 0.4,
        delay: 0.2
      }
    }
  };

  return (
    <LogoContainer
      size={size}
      initial="initial"
      animate="animate"
      whileHover="hover"
    >
      <IconWrapper variants={iconVariants}>
        <FiMessageCircle />
      </IconWrapper>
      {showText && (
        <LogoText variants={textVariants}>
          ChatWave
        </LogoText>
      )}
    </LogoContainer>
  );
};

const LogoContainer = styled(motion.div)<{ size: string }>`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  color: ${({ theme }) => theme.colors.primary};
  font-size: ${({ size }) => 
    size === 'small' ? '1.25rem' : 
    size === 'large' ? '2rem' : 
    '1.75rem'};
`;

const IconWrapper = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.primary};
`;

const LogoText = styled(motion.span)`
  ${({ theme }) => theme.typography.logo};
  background: linear-gradient(135deg, 
    ${({ theme }) => theme.colors.primary} 0%, 
    ${({ theme }) => theme.colors.primaryLight} 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  letter-spacing: -0.02em;
`;

export default Logo; 