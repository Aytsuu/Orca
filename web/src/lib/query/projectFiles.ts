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
    mutationFn: ({ file, purpose = 'source' }: { file: File; purpose?: 'chat' | 'source' }) =>
      defaultProjectRepository.uploadProjectFile(projectId, file, sessionId.get(), purpose),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
    },
  });
}

export function useProjectFileAccessUrl(projectId: string, fileId: string) {
  return useQuery({
    queryKey: ['project-file-access-url', projectId, fileId],
    queryFn: () => defaultProjectRepository.fetchProjectFileAccessUrl(projectId, fileId, sessionId.get()),
    enabled: Boolean(projectId && fileId),
    staleTime: 1000 * 60 * 30,
  });
}

export function usePromoteProjectFileToSource(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      defaultProjectRepository.promoteProjectFileToSource(projectId, fileId, sessionId.get()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
    },
  });
}

export function useDeleteProjectFile(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (fileId: string) =>
      defaultProjectRepository.deleteProjectFile(projectId, fileId, sessionId.get()),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-files', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
      void queryClient.invalidateQueries({ queryKey: ['project-plan', projectId] });
    },
  });
}
