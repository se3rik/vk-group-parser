const VK_V = "5.131";

export interface VKPost {
  id: number;
  date: number;
  text: string;
}

export interface VKRawUser {
  id: number;
  first_name: string;
  last_name: string;
}

export interface OwnerInfo {
  name: string;
  type: "group" | "user";
}

interface ProgressPayload {
  fetched: number;
  total: number;
}

async function vkRequest<T>(
  method: string,
  params: Record<string, string | number>,
  token: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const callbackName = `vk_cb_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const url = new URL(`https://api.vk.com/method/${method}`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("v", VK_V);
    url.searchParams.set("callback", callbackName);
    Object.entries(params).forEach(([k, v]) =>
      url.searchParams.set(k, String(v)),
    );

    const script = document.createElement("script");
    script.src = url.toString();

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("VK request timeout"));
    }, 15000);

    function cleanup() {
      clearTimeout(timer);
      delete (window as unknown as Record<string, unknown>)[callbackName];
      script.remove();
    }

    (window as unknown as Record<string, unknown>)[callbackName] = (data: {
      error?: { error_code: number; error_msg: string };
      response: T;
    }) => {
      cleanup();
      if (data.error) {
        reject(
          new Error(
            `VK Error ${data.error.error_code}: ${data.error.error_msg}`,
          ),
        );
      } else {
        resolve(data.response);
      }
    };

    document.head.appendChild(script);
  });
}

// async function vkRequest<T>(
//   method: string,
//   params: Record<string, string | number>,
//   token: string,
// ): Promise<T> {
//   const baseUrl = import.meta.env.DEV
//     ? `/vkapi/method/${method}`
//     : `https://api.vk.com/method/${method}`;
//   const url = new URL(baseUrl, window.location.origin);
//   url.searchParams.set("access_token", token);
//   url.searchParams.set("v", VK_V);
//   Object.entries(params).forEach(([k, v]) =>
//     url.searchParams.set(k, String(v)),
//   );

//   const res = await fetch(url.toString());
//   const data = await res.json();

//   if (data.error)
//     throw new Error(
//       `VK Error ${data.error.error_code}: ${data.error.error_msg}`,
//     );
//   return data.response as T;
// }

export async function fetchPostsInRange(
  token: string,
  ownerId: string,
  dateFrom: number,
  dateTo: number,
  onProgress?: (p: ProgressPayload) => void,
): Promise<VKPost[]> {
  const allPosts: VKPost[] = [];
  let offset = 0;
  const count = 100;
  let total: number | null = null;

  while (true) {
    const response = await vkRequest<{ count: number; items: VKPost[] }>(
      "wall.get",
      { owner_id: ownerId, count, offset, filter: "owner" },
      token,
    );

    if (total === null) total = response.count;
    const items = response.items;

    if (!items.length) break;

    for (const post of items) {
      if (post.date >= dateFrom && post.date <= dateTo) {
        allPosts.push(post);
      }
    }

    onProgress?.({ fetched: offset + items.length, total });

    if (items[items.length - 1].date < dateFrom) break;
    if (offset + count >= total) break;

    offset += count;
    await sleep(350);
  }

  return allPosts;
}

export async function fetchLikes(
  token: string,
  ownerId: string,
  postId: number,
): Promise<number[]> {
  const allLikes: number[] = [];
  let offset = 0;
  const count = 1000;

  while (true) {
    const response = await vkRequest<{ count: number; items: number[] }>(
      "likes.getList",
      {
        type: "post",
        owner_id: ownerId,
        item_id: postId,
        count,
        offset,
        skip_own: 0,
      },
      token,
    );
    const items = response.items || [];
    allLikes.push(...items);

    if (allLikes.length >= response.count || items.length < count) break;

    offset += count;
    await sleep(350);
  }

  return allLikes;
}

export async function fetchUsers(
  token: string,
  userIds: number[],
): Promise<VKRawUser[]> {
  if (!userIds.length) return [];
  const chunks = chunkArray(userIds, 300);
  const results: VKRawUser[] = [];
  for (const chunk of chunks) {
    const users = await vkRequest<VKRawUser[]>(
      "users.get",
      { user_ids: chunk.join(",") },
      token,
    );
    results.push(...users);
    await sleep(350);
  }
  return results;
}

export async function fetchOwnerInfo(
  token: string,
  ownerId: string,
): Promise<OwnerInfo> {
  const id = Number(ownerId);
  if (id < 0) {
    const res = await vkRequest<{ groups: Array<{ name: string }> }>(
      "groups.getById",
      { group_id: Math.abs(id) },
      token,
    );
    const group = res.groups?.[0];
    return { name: group?.name || `Группа ${Math.abs(id)}`, type: "group" };
  } else {
    const res = await vkRequest<VKRawUser[]>(
      "users.get",
      { user_ids: id },
      token,
    );
    const user = res[0];
    return { name: `${user?.first_name} ${user?.last_name}`, type: "user" };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}
