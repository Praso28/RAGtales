import React from 'react';
import { Feather } from 'lucide-react';

export default function ScribeMessage({ message, type = 'speaking' }) {
  if (!message) return null;

  // Render Scribe message container with animated pulse on thinking, green tint on done
  const getStyle = () => {
    switch (type) {
      case 'thinking':
        return {
          background: 'rgba(59, 130, 246, 0.06)',
          borderColor: 'rgba(59, 130, 246, 0.2)',
        };
      case 'done':
        return {
          background: 'rgba(16, 185, 129, 0.06)',
          borderColor: 'rgba(16, 185, 129, 0.2)',
        };
      case 'speaking':
      default:
        return {};
    }
  };

  return (
    <div className="scribe-message" style={getStyle()}>
      <div 
        className="scribe-avatar"
        style={{
          animation: type === 'thinking' ? 'pulse 1.5s infinite ease-in-out' : 'none'
        }}
      >
        <Feather size={12} color="#fff" />
      </div>
      <div>
        {message}
      </div>
    </div>
  );
}
