import { describe, expect, it, vi } from 'vitest';

import type { ProjectMessage } from '../../stores/project/types';
import {
  buildOptimisticProjectMessage,
  mergeIncomingProjectMessage,
  replaceOptimisticProjectMessage,
  subscribeToProjectMessagesRealtime,
} from './projectMessages';

describe('projectMessages helpers', () => {
  it('builds an optimistic project message for the current session', () => {
    const now = new Date('2026-06-17T10:00:00Z');

    const message = buildOptimisticProjectMessage('proj_1', 'alpha', 'Ship it', [], now);

    expect(message).toMatchObject({
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      createdAt: '2026-06-17T10:00:00.000Z',
      isOptimistic: true,
    });
    expect(message.id).toMatch(/^optimistic:/);
  });

  it('replaces the optimistic message with the persisted message', () => {
    const optimistic: ProjectMessage = {
      id: 'optimistic:1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:00.000Z',
      isOptimistic: true,
    };
    const persisted: ProjectMessage = {
      id: 'msg_1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:01.000Z',
    };

    const messages = replaceOptimisticProjectMessage([optimistic], optimistic.id, persisted);

    expect(messages).toEqual([persisted]);
  });

  it('merges a realtime message by replacing a matching optimistic message', () => {
    const optimistic: ProjectMessage = {
      id: 'optimistic:1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:00.000Z',
      isOptimistic: true,
    };
    const incoming: ProjectMessage = {
      id: 'msg_1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:01.000Z',
    };

    const messages = mergeIncomingProjectMessage([optimistic], incoming);

    expect(messages).toEqual([incoming]);
  });

  it('does not duplicate a realtime message that already exists', () => {
    const incoming: ProjectMessage = {
      id: 'msg_1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:01.000Z',
    };

    const messages = mergeIncomingProjectMessage([incoming], incoming);

    expect(messages).toEqual([incoming]);
  });

  it('subscribes to project-specific realtime inserts and merges them into cache', () => {
    const setQueryData = vi.fn();
    const subscribe = vi.fn();
    const on = vi.fn();
    const removeChannel = vi.fn();
    const channel = {
      on,
      subscribe,
    };
    const client = {
      channel: vi.fn(() => channel),
      removeChannel,
    };

    let realtimeCallback: ((payload: { new: {
      id: string;
      project_id: string;
      session_id: string;
      content: string;
      created_at: string;
    } }) => void) | null = null;

    on.mockImplementation((type, filter, callback) => {
      expect(type).toBe('postgres_changes');
      expect(filter).toEqual({
        event: 'INSERT',
        schema: 'public',
        table: 'chat_message',
        filter: 'project_id=eq.proj_1',
      });
      realtimeCallback = callback;
      return channel;
    });

    const unsubscribe = subscribeToProjectMessagesRealtime(
      client as never,
      { setQueryData } as never,
      'proj_1'
    );

    expect(client.channel).toHaveBeenCalledWith('project:proj_1:chat-messages');
    expect(subscribe).toHaveBeenCalledTimes(1);
    expect(realtimeCallback).not.toBeNull();

    (realtimeCallback as any)?.({
      new: {
        id: 'msg_1',
        project_id: 'proj_1',
        session_id: 'alpha',
        content: 'Ship it',
        created_at: '2026-06-17T10:00:01.000Z',
      },
    });

    expect(setQueryData).toHaveBeenCalledTimes(1);
    const [queryKey, updater] = setQueryData.mock.calls[0];
    expect(queryKey).toEqual(['project-messages', 'proj_1']);

    const optimistic: ProjectMessage = {
      id: 'optimistic:1',
      projectId: 'proj_1',
      sessionId: 'alpha',
      content: 'Ship it',
      attachments: [],
      createdAt: '2026-06-17T10:00:00.000Z',
      isOptimistic: true,
    };

    expect(updater([optimistic])).toEqual([
      {
        id: 'msg_1',
        projectId: 'proj_1',
        sessionId: 'alpha',
        content: 'Ship it',
        attachments: [],
        createdAt: '2026-06-17T10:00:01.000Z',
      },
    ]);

    unsubscribe();

    expect(removeChannel).toHaveBeenCalledWith(channel);
  });
});
