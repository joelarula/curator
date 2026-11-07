import { activeProjectId } from './composables/useAuth';

export async function requestGraphql<T = any>(
  query: string,
  variables?: Record<string, any>
): Promise<T> {
  const token =
    typeof localStorage !== 'undefined' ? localStorage.getItem('gallery_token') : null;
  const projectId =
    activeProjectId.value ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('gallery_project_id') : null) ||
    'artmoments';

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-project-id': projectId,
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch('/graphql', {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(json.errors[0].message || 'GraphQL request error');
  }
  return json.data as T;
}
