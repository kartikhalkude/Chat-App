import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import styled from 'styled-components';
import { motion } from 'framer-motion';
import { FiMail, FiLock } from 'react-icons/fi';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();
      if (data.success) {
        localStorage.setItem('username', username);
        navigate('/chat');
      } else {
        setError(data.message || 'Login failed');
      }
    } catch (error) {
      console.error('Login failed:', error);
      setError('Login failed. Please try again.');
    }
  };

  return (
    <Container
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <FormCard
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Title>Welcome Back</Title>
        <Subtitle>Please sign in to continue</Subtitle>
        
        <Form onSubmit={handleSubmit}>
          <InputGroup>
            <InputIcon>
              <FiMail />
            </InputIcon>
            <Input
              type="text"
              placeholder="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </InputGroup>

          <InputGroup>
            <InputIcon>
              <FiLock />
            </InputIcon>
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </InputGroup>

          {error && <ErrorMessage>{error}</ErrorMessage>}

          <Button
            type="submit"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Sign In
          </Button>
        </Form>

        <Footer>
          Don't have an account?{' '}
          <StyledLink to="/register">Sign up</StyledLink>
        </Footer>
      </FormCard>
    </Container>
  );
};

const Container = styled(motion.div)`
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  padding: 2rem;
`;

const FormCard = styled(motion.div)`
  background-color: ${({ theme }) => theme.colors.surface};
  padding: 2.5rem;
  border-radius: ${({ theme }) => theme.borderRadius.large};
  width: 100%;
  max-width: 400px;
  box-shadow: ${({ theme }) => theme.shadows.large};
`;

const Title = styled.h1`
  color: ${({ theme }) => theme.colors.text};
  text-align: center;
  margin-bottom: 0.5rem;
  ${({ theme }) => theme.typography.h1};
`;

const Subtitle = styled.p`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-align: center;
  margin-bottom: 2rem;
  ${({ theme }) => theme.typography.body};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const InputGroup = styled.div`
  position: relative;
`;

const InputIcon = styled.div`
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  color: ${({ theme }) => theme.colors.textSecondary};
  font-size: 1.2rem;
`;

const Input = styled.input`
  width: 100%;
  padding: 1rem 1rem 1rem 3rem;
  background-color: ${({ theme }) => theme.colors.background};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  color: ${({ theme }) => theme.colors.text};
  transition: border-color ${({ theme }) => theme.transitions.fast};

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }

  &::placeholder {
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 0.875rem;
  text-align: center;
`;

const Button = styled(motion.button)`
  background-color: ${({ theme }) => theme.colors.primary};
  color: white;
  padding: 1rem;
  border-radius: ${({ theme }) => theme.borderRadius.medium};
  font-weight: 600;
  transition: background-color ${({ theme }) => theme.transitions.fast};

  &:hover {
    background-color: ${({ theme }) => theme.colors.primaryLight};
  }
`;

const Footer = styled.p`
  text-align: center;
  margin-top: 2rem;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const StyledLink = styled(Link)`
  color: ${({ theme }) => theme.colors.primary};
  font-weight: 600;
  transition: color ${({ theme }) => theme.transitions.fast};

  &:hover {
    color: ${({ theme }) => theme.colors.primaryLight};
  }
`;

export default Login; 