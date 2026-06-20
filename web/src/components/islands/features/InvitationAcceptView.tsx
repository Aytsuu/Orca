import React, { useEffect, useState } from 'react';
import { navigate } from 'astro:transitions/client';

import { acceptMemberInvitation } from '../../../stores/projectStore';

interface InvitationAcceptViewProps {
  token: string;
}

export const InvitationAcceptView: React.FC<InvitationAcceptViewProps> = ({ token }) => {
  const [message, setMessage] = useState('Adding you to the project...');

  useEffect(() => {
    let isMounted = true;

    const run = async () => {
      const projectId = await acceptMemberInvitation(token);
      if (!isMounted) {
        return;
      }

      if (projectId) {
        setMessage('Invitation accepted. Redirecting to the project...');
        void navigate(`/project/${projectId}/chat`);
        return;
      }

      setMessage('This invitation link could not be used.');
    };

    void run();

    return () => {
      isMounted = false;
    };
  }, [token]);

  return (
    <div className="max-w-[720px] mx-auto px-8 py-24 w-full flex flex-col items-center justify-center text-center gap-4">
      <span className="section-label">Project Invitation</span>
      <h2 className="text-text-primary text-xl font-bold">Joining workspace</h2>
      <p className="text-text-secondary text-sm">{message}</p>
    </div>
  );
};

export default InvitationAcceptView;
