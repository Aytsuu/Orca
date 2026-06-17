import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { defaultProjectRepository } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';

export function useProjectMessages(projectId: string) {
  return useQuery({
    queryKey: ['project-messages', projectId],
    queryFn: () => defaultProjectRepository.fetchProjectMessages(projectId, sessionId.get()),
    enabled: Boolean(projectId),
  });
}

export function useSendProjectMessage(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      defaultProjectRepository.createProjectMessage(projectId, content, sessionId.get()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
    },
  });
}
