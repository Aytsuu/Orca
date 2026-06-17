import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { defaultProjectRepository } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';

export function useProjectFiles(projectId: string) {
  return useQuery({
    queryKey: ['project-files', projectId],
    queryFn: () => defaultProjectRepository.fetchProjectFiles(projectId, sessionId.get()),
    enabled: Boolean(projectId),
  });
}

export function useUploadProjectFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) =>
      defaultProjectRepository.uploadProjectFile(projectId, file, sessionId.get()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
    },
  });
}
