import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getSupabaseBrowserClient } from '../supabase/browser';
import { defaultProjectRepository } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';
import type { ApiProjectMessage, ProjectMessage } from '../../stores/project/types';

interface ProjectMessagesRealtimePayload {
  new: ApiProjectMessage;
}

interface ProjectMessagesRealtimeChannel {
  on(
    type: 'postgres_changes',
    filter: {
      event: 'INSERT';
      schema: 'public';
      table: 'chat_message';
      filter: string;
    },
    callback: (payload: ProjectMessagesRealtimePayload) => void
  ): ProjectMessagesRealtimeChannel;
  subscribe(): unknown;
}

interface ProjectMessagesRealtimeClient {
  channel(name: string): ProjectMessagesRealtimeChannel;
  removeChannel(channel: ProjectMessagesRealtimeChannel): Promise<unknown> | unknown;
}

export function useProjectMessages(projectId: string) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['project-messages', projectId],
    queryFn: () => defaultProjectRepository.fetchProjectMessages(projectId, sessionId.get()),
    enabled: Boolean(projectId),
  });

  useEffect(() => {
    if (!projectId) {
      return;
    }

    let active = true;
    let unsubscribe = () => {};

    void getSupabaseBrowserClient().then((client) => {
      if (!client) {
        return;
      }

      const stop = subscribeToProjectMessagesRealtime(
        client as ProjectMessagesRealtimeClient,
        queryClient,
        projectId
      );

      if (!active) {
        stop();
        return;
      }

      unsubscribe = stop;
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [projectId, queryClient]);

  return query;
}

export function useSendProjectMessage(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (content: string) =>
      defaultProjectRepository.createProjectMessage(projectId, content, sessionId.get()),
    onMutate: async (content: string) => {
      await queryClient.cancelQueries({ queryKey: ['project-messages', projectId] });
      const previousMessages = queryClient.getQueryData<ProjectMessage[]>(['project-messages', projectId]);
      const newMessage = buildOptimisticProjectMessage(projectId, sessionId.get(), content);
      queryClient.setQueryData<ProjectMessage[]>(
        ['project-messages', projectId],
        (old) => (old ? [...old, newMessage] : [newMessage])
      );
      return { previousMessages, optimisticId: newMessage.id };
    },
    onError: (err, variables, context) => {
      queryClient.setQueryData(['project-messages', projectId], context?.previousMessages);
    },
    onSuccess: (data, variables, context) => {
      queryClient.setQueryData<ProjectMessage[]>(
        ['project-messages', projectId],
        (old) => {
          if (!old) return [data];
          return replaceOptimisticProjectMessage(old, context.optimisticId, data);
        }
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
    },
  });
}

export function buildOptimisticProjectMessage(
  projectId: string,
  sessionId: string,
  content: string,
  now: Date = new Date()
): ProjectMessage {
  return {
    id: `optimistic:${Math.random().toString(36).slice(2, 9)}`,
    projectId,
    sessionId,
    content,
    createdAt: now.toISOString(),
    isOptimistic: true,
  };
}

export function replaceOptimisticProjectMessage(
  messages: ProjectMessage[],
  optimisticId: string,
  persisted: ProjectMessage
): ProjectMessage[] {
  return messages.map(msg => (msg.id === optimisticId ? persisted : msg));
}

export function mergeIncomingProjectMessage(
  messages: ProjectMessage[],
  incoming: ProjectMessage
): ProjectMessage[] {
  if (messages.some(msg => msg.id === incoming.id)) {
    return messages;
  }

  const optIndex = messages.findIndex(
    msg =>
      msg.isOptimistic &&
      msg.sessionId === incoming.sessionId &&
      msg.content === incoming.content
  );

  if (optIndex !== -1) {
    const updated = [...messages];
    updated[optIndex] = incoming;
    return updated;
  }

  return [...messages, incoming];
}

export function subscribeToProjectMessagesRealtime(
  client: ProjectMessagesRealtimeClient,
  queryClient: Pick<QueryClient, 'setQueryData'>,
  projectId: string
): () => void {
  const channel = client
    .channel(`project:${projectId}:chat-messages`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_message',
        filter: `project_id=eq.${projectId}`,
      },
      (payload) => {
        const incoming = mapRealtimeProjectMessage(payload.new);
        queryClient.setQueryData<ProjectMessage[]>(
          ['project-messages', projectId],
          (current) => mergeIncomingProjectMessage(current ?? [], incoming)
        );
      }
    );

  channel.subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}

function mapRealtimeProjectMessage(message: ApiProjectMessage): ProjectMessage {
  return {
    id: message.id,
    projectId: message.project_id,
    sessionId: message.session_id,
    content: message.content,
    createdAt: message.created_at,
  };
}

