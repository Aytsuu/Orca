import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { getSupabaseBrowserClient } from '../supabase/browser';
import { defaultProjectRepository } from '../../stores/project/repository';
import { sessionId } from '../../stores/project/session';
import type {
  ApiProjectMessage,
  ProjectMessage,
  ProjectMessageAttachment,
  ProjectSendMessageResult,
} from '../../stores/project/types';

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
    let unsubscribe = () => { };

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

export function useProjectCommands(projectId: string) {
  return useQuery({
    queryKey: ['project-commands', projectId],
    queryFn: () => defaultProjectRepository.fetchProjectCommands(projectId, sessionId.get()),
    enabled: Boolean(projectId),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: Number.POSITIVE_INFINITY,
  });
}

export function useSendProjectMessage(projectId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: { content: string; attachments?: ProjectMessageAttachment[] }) =>
      defaultProjectRepository.createProjectMessage(projectId, payload, sessionId.get()),
    onMutate: async (payload: { content: string; attachments?: ProjectMessageAttachment[] }) => {
      if (isSlashCommandInput(payload.content)) {
        return { previousMessages: undefined, optimisticId: undefined };
      }
      await queryClient.cancelQueries({ queryKey: ['project-messages', projectId] });
      const previousMessages = queryClient.getQueryData<ProjectMessage[]>(['project-messages', projectId]);
      const newMessage = buildOptimisticProjectMessage(
        projectId,
        sessionId.get(),
        payload.content,
        payload.attachments || []
      );
      queryClient.setQueryData<ProjectMessage[]>(
        ['project-messages', projectId],
        (old) => (old ? [...old, newMessage] : [newMessage])
      );
      return { previousMessages, optimisticId: newMessage.id };
    },
    onError: (err, variables, context) => {
      if (context?.previousMessages) {
        queryClient.setQueryData(['project-messages', projectId], context.previousMessages);
      }
    },
    onSuccess: (data: ProjectSendMessageResult, variables, context) => {
      if (data.kind === 'ephemeral' || !context?.optimisticId) {
        return;
      }
      queryClient.setQueryData<ProjectMessage[]>(
        ['project-messages', projectId],
        (old) => {
          if (!old) return [data.message];
          return replaceOptimisticProjectMessage(old, context.optimisticId, data.message);
        }
      );
    },
    onSettled: (data) => {
      if (data?.kind !== 'ephemeral') {
        void queryClient.invalidateQueries({ queryKey: ['project-messages', projectId] });
      }
    },
  });
}

export function buildOptimisticProjectMessage(
  projectId: string,
  sessionId: string,
  content: string,
  attachments: ProjectMessageAttachment[] = [],
  now: Date = new Date()
): ProjectMessage {
  return {
    id: `optimistic:${Math.random().toString(36).slice(2, 9)}`,
    projectId,
    sessionId,
    content,
    attachments,
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
      msg.content === incoming.content &&
      JSON.stringify(msg.attachments) === JSON.stringify(incoming.attachments)
  );

  if (optIndex !== -1) {
    const updated = [...messages];
    updated[optIndex] = incoming;
    return updated;
  }

  return [...messages, incoming];
}

export function isSlashCommandInput(content: string): boolean {
  return content.trimStart().startsWith('/');
}

export function buildEphemeralProjectMessage(
  projectId: string,
  sessionId: string,
  commandText: string,
  content: string,
  now: Date = new Date()
): ProjectMessage {
  return {
    id: `ephemeral:${Math.random().toString(36).slice(2, 9)}`,
    projectId,
    sessionId,
    content,
    attachments: [],
    createdAt: now.toISOString(),
    isEphemeral: true,
    ephemeralLabel: 'Only visible to you',
    commandName: commandText.replace(/^\s*\//, '').split(/\s+/, 1)[0] || 'command',
  };
}

export function mergeRenderedProjectMessages(
  persistedMessages: ProjectMessage[],
  ephemeralMessages: ProjectMessage[]
): ProjectMessage[] {
  return [...persistedMessages, ...ephemeralMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

export function buildEphemeralMessageStorageKey(projectId: string, currentSessionId: string): string {
  return `orca:project:${projectId}:session:${currentSessionId}:ephemeral-messages`;
}

export function serializeEphemeralProjectMessages(messages: ProjectMessage[]): string {
  return JSON.stringify(
    messages.filter((message) => message.isEphemeral && !message.isOptimistic).map((message) => ({
      id: message.id,
      projectId: message.projectId,
      sessionId: message.sessionId,
      content: message.content,
      attachments: message.attachments,
      createdAt: message.createdAt,
      isEphemeral: true,
      ephemeralLabel: message.ephemeralLabel,
      commandName: message.commandName,
    }))
  );
}

export function parseEphemeralProjectMessages(serialized: string | null): ProjectMessage[] {
  if (!serialized) {
    return [];
  }

  try {
    const parsed = JSON.parse(serialized) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (!item || typeof item !== 'object') {
        return [];
      }

      const candidate = item as Record<string, unknown>;
      if (
        typeof candidate.id !== 'string' ||
        typeof candidate.projectId !== 'string' ||
        typeof candidate.sessionId !== 'string' ||
        typeof candidate.content !== 'string' ||
        typeof candidate.createdAt !== 'string'
      ) {
        return [];
      }

      return [
        {
          id: candidate.id,
          projectId: candidate.projectId,
          sessionId: candidate.sessionId,
          content: candidate.content,
          attachments: Array.isArray(candidate.attachments)
            ? (candidate.attachments as ProjectMessageAttachment[])
            : [],
          createdAt: candidate.createdAt,
          isEphemeral: true,
          ephemeralLabel:
            typeof candidate.ephemeralLabel === 'string' ? candidate.ephemeralLabel : 'Only visible to you',
          commandName: typeof candidate.commandName === 'string' ? candidate.commandName : undefined,
        },
      ];
    });
  } catch {
    return [];
  }
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
    attachments: (message.attachments || []).map((attachment) => ({
      uploadedFileId: attachment.uploaded_file_id,
      filename: attachment.filename,
      mimeType: attachment.mime_type,
      storagePath: attachment.storage_path,
      sizeBytes: attachment.size_bytes,
    })),
    createdAt: message.created_at,
  };
}

