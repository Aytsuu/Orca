import type { APIRoute } from 'astro';

import { getApiBaseUrl, getSessionId, jsonResponse } from '../../../../../lib/api/server';

interface ApiEnvelope<T> {
  data: T;
}

interface UploadUrlResponse {
  bucket: string;
  storage_path: string;
  token: string;
  signed_url: string | null;
}

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const projectId = context.params.id;
  if (!projectId) {
    return jsonResponse({ error: 'Project id is required.' }, 400);
  }

  const currentSessionId = getSessionId(context);
  if (!currentSessionId) {
    return jsonResponse({ error: 'Missing X-Session-Id header' }, 400);
  }

  const formData = await context.request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File)) {
    return jsonResponse({ error: 'A file is required.' }, 400);
  }

  const filename = file.name.trim();
  const mimeType = file.type.trim() || 'application/octet-stream';
  if (!filename) {
    return jsonResponse({ error: 'Filename is required.' }, 400);
  }

  const uploadUrlResponse = await fetch(
    `${getApiBaseUrl()}/api/v1/projects/${projectId}/files/upload-url?filename=${encodeURIComponent(
      filename
    )}&mime_type=${encodeURIComponent(mimeType)}`,
    {
      headers: {
        'X-Session-Id': currentSessionId,
      },
    }
  );

  if (!uploadUrlResponse.ok) {
    return new Response(uploadUrlResponse.body, {
      status: uploadUrlResponse.status,
      headers: {
        'Content-Type': uploadUrlResponse.headers.get('Content-Type') || 'application/json',
      },
    });
  }

  const uploadUrlPayload = (await uploadUrlResponse.json()) as ApiEnvelope<UploadUrlResponse>;
  const signedUrl = uploadUrlPayload.data.signed_url;
  if (!signedUrl) {
    return jsonResponse(
      {
        error: {
          code: 'SIGNED_UPLOAD_URL_MISSING',
          message: 'The backend did not return a signed upload URL.',
        },
      },
      502
    );
  }

  const fileBuffer = await file.arrayBuffer();
  const uploadResponse = await fetch(signedUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    return jsonResponse(
      {
        error: {
          code: 'FILE_UPLOAD_FAILED',
          message: 'Uploading the file to storage failed.',
        },
      },
      502
    );
  }

  const finalizeResponse = await fetch(`${getApiBaseUrl()}/api/v1/projects/${projectId}/files`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Session-Id': currentSessionId,
    },
    body: JSON.stringify({
      filename,
      mime_type: mimeType,
      storage_path: uploadUrlPayload.data.storage_path,
      size_bytes: file.size,
    }),
  });

  return new Response(finalizeResponse.body, {
    status: finalizeResponse.status,
    headers: {
      'Content-Type': finalizeResponse.headers.get('Content-Type') || 'application/json',
    },
  });
};
