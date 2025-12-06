import "server-only";

import type { ArtifactKind } from "@/components/artifact";
import type { VisibilityType } from "@/components/visibility-selector";
import { ChatSDKError } from "../errors";
import type { AppUsage } from "../usage";
import { generateUUID } from "../utils";
import type { Chat, DBMessage, Document, Suggestion, Stream, User, Vote } from "./schema";
import { generateHashedPassword } from "./utils";

// In-memory storage
const users = new Map<string, User>();
const chats = new Map<string, Chat>();
const messages = new Map<string, DBMessage>();
const votes = new Map<string, Vote>();
const documents = new Map<string, Document[]>();
const suggestions = new Map<string, Suggestion[]>();
const streams = new Map<string, Stream[]>();

// Helper to get all messages for a chat
function getMessagesForChat(chatId: string): DBMessage[] {
  return Array.from(messages.values()).filter((msg) => msg.chatId === chatId);
}

// Helper to get all chats for a user
function getChatsForUser(userId: string): Chat[] {
  return Array.from(chats.values()).filter((chat) => chat.userId === userId);
}

export async function getUser(email: string): Promise<User[]> {
  try {
    const userArray = Array.from(users.values()).filter((u) => u.email === email);
    return userArray;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get user by email"
    );
  }
}

export async function createUser(email: string, password: string) {
  const hashedPassword = generateHashedPassword(password);
  const id = generateUUID();

  try {
    const newUser: User = {
      id,
      email,
      password: hashedPassword,
    };
    users.set(id, newUser);
    return newUser;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to create user");
  }
}

export async function createGuestUser() {
  const email = `guest-${Date.now()}`;
  const password = generateHashedPassword(generateUUID());
  const id = generateUUID();

  try {
    const newUser: User = {
      id,
      email,
      password,
    };
    users.set(id, newUser);
    return [{
      id: newUser.id,
      email: newUser.email,
    }];
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new ChatSDKError(
      "bad_request:database",
      `Failed to create guest user: ${errorMessage}`
    );
  }
}

export async function saveChat({
  id,
  userId,
  title,
  visibility,
}: {
  id: string;
  userId: string;
  title: string;
  visibility: VisibilityType;
}) {
  try {
    const newChat: Chat = {
      id,
      createdAt: new Date(),
      userId,
      title,
      visibility,
      lastContext: null,
    };
    chats.set(id, newChat);
    return newChat;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save chat");
  }
}

export async function deleteChatById({ id }: { id: string }) {
  try {
    // Delete related votes
    for (const [voteKey, vote] of votes.entries()) {
      if (vote.chatId === id) {
        votes.delete(voteKey);
      }
    }

    // Delete related messages
    for (const [msgKey, msg] of messages.entries()) {
      if (msg.chatId === id) {
        messages.delete(msgKey);
      }
    }

    // Delete related streams
    for (const [streamKey, stream] of streams.entries()) {
      const streamArray = stream;
      if (streamArray.some((s) => s.chatId === id)) {
        streams.delete(streamKey);
      }
    }

    const chat = chats.get(id);
    if (chat) {
      chats.delete(id);
      return chat;
    }
    return null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete chat by id"
    );
  }
}

export async function deleteAllChatsByUserId({ userId }: { userId: string }) {
  try {
    const userChats = getChatsForUser(userId);

    if (userChats.length === 0) {
      return { deletedCount: 0 };
    }

    const chatIds = userChats.map((c) => c.id);

    // Delete related votes
    for (const [voteKey, vote] of votes.entries()) {
      if (chatIds.includes(vote.chatId)) {
        votes.delete(voteKey);
      }
    }

    // Delete related messages
    for (const [msgKey, msg] of messages.entries()) {
      if (chatIds.includes(msg.chatId)) {
        messages.delete(msgKey);
      }
    }

    // Delete related streams
    for (const [streamKey, streamArray] of streams.entries()) {
      if (streamArray.some((s) => chatIds.includes(s.chatId))) {
        streams.delete(streamKey);
      }
    }

    // Delete chats
    for (const chatId of chatIds) {
      chats.delete(chatId);
    }

    return { deletedCount: userChats.length };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete all chats by user id"
    );
  }
}

export async function getChatsByUserId({
  id,
  limit,
  startingAfter,
  endingBefore,
}: {
  id: string;
  limit: number;
  startingAfter: string | null;
  endingBefore: string | null;
}) {
  try {
    let filteredChats = getChatsForUser(id);

    // Sort by createdAt descending
    filteredChats.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    if (startingAfter) {
      const selectedChat = chats.get(startingAfter);
      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${startingAfter} not found`
        );
      }
      filteredChats = filteredChats.filter(
        (chat) => chat.createdAt > selectedChat.createdAt
      );
    } else if (endingBefore) {
      const selectedChat = chats.get(endingBefore);
      if (!selectedChat) {
        throw new ChatSDKError(
          "not_found:database",
          `Chat with id ${endingBefore} not found`
        );
      }
      filteredChats = filteredChats.filter(
        (chat) => chat.createdAt < selectedChat.createdAt
      );
    }

    const hasMore = filteredChats.length > limit;

    return {
      chats: hasMore ? filteredChats.slice(0, limit) : filteredChats,
      hasMore,
    };
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get chats by user id"
    );
  }
}

export async function getChatById({ id }: { id: string }) {
  try {
    const selectedChat = chats.get(id);
    if (!selectedChat) {
      return null;
    }

    return selectedChat;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to get chat by id");
  }
}

export async function saveMessages({ messages: msgs }: { messages: DBMessage[] }) {
  try {
    for (const msg of msgs) {
      messages.set(msg.id, msg);
    }
    return msgs;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save messages");
  }
}

export async function getMessagesByChatId({ id }: { id: string }) {
  try {
    const chatMessages = getMessagesForChat(id);
    chatMessages.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return chatMessages;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get messages by chat id"
    );
  }
}

export async function voteMessage({
  chatId,
  messageId,
  type,
}: {
  chatId: string;
  messageId: string;
  type: "up" | "down";
}) {
  try {
    const voteKey = `${chatId}-${messageId}`;
    const existingVote = votes.get(voteKey);

    if (existingVote) {
      existingVote.isUpvoted = type === "up";
      votes.set(voteKey, existingVote);
      return existingVote;
    }

    const newVote: Vote = {
      chatId,
      messageId,
      isUpvoted: type === "up",
    };
    votes.set(voteKey, newVote);
    return newVote;
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to vote message");
  }
}

export async function getVotesByChatId({ id }: { id: string }) {
  try {
    return Array.from(votes.values()).filter((vote) => vote.chatId === id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get votes by chat id"
    );
  }
}

export async function saveDocument({
  id,
  title,
  kind,
  content,
  userId,
}: {
  id: string;
  title: string;
  kind: ArtifactKind;
  content: string;
  userId: string;
}) {
  try {
    const newDocument: Document = {
      id,
      title,
      kind,
      content,
      userId,
      createdAt: new Date(),
    };

    const existingDocs = documents.get(id) || [];
    existingDocs.push(newDocument);
    documents.set(id, existingDocs);

    return [newDocument];
  } catch (_error) {
    throw new ChatSDKError("bad_request:database", "Failed to save document");
  }
}

export async function getDocumentsById({ id }: { id: string }) {
  try {
    const docs = documents.get(id) || [];
    docs.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return docs;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get documents by id"
    );
  }
}

export async function getDocumentById({ id }: { id: string }) {
  try {
    const docs = documents.get(id) || [];
    if (docs.length === 0) {
      return null;
    }
    // Return the most recent document
    docs.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return docs[0];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get document by id"
    );
  }
}

export async function deleteDocumentsByIdAfterTimestamp({
  id,
  timestamp,
}: {
  id: string;
  timestamp: Date;
}) {
  try {
    const docs = documents.get(id) || [];
    const docsToKeep = docs.filter((doc) => doc.createdAt <= timestamp);
    const docsToDelete = docs.filter((doc) => doc.createdAt > timestamp);

    // Delete related suggestions
    for (const doc of docsToDelete) {
      const docSuggestions = suggestions.get(id) || [];
      const suggestionsToKeep = docSuggestions.filter(
        (s) => s.documentCreatedAt <= timestamp
      );
      suggestions.set(id, suggestionsToKeep);
    }

    if (docsToKeep.length === 0) {
      documents.delete(id);
    } else {
      documents.set(id, docsToKeep);
    }

    return docsToDelete;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete documents by id after timestamp"
    );
  }
}

export async function saveSuggestions({
  suggestions: suggs,
}: {
  suggestions: Suggestion[];
}) {
  try {
    for (const sugg of suggs) {
      const existing = suggestions.get(sugg.documentId) || [];
      existing.push(sugg);
      suggestions.set(sugg.documentId, existing);
    }
    return suggs;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to save suggestions"
    );
  }
}

export async function getSuggestionsByDocumentId({
  documentId,
}: {
  documentId: string;
}) {
  try {
    return suggestions.get(documentId) || [];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get suggestions by document id"
    );
  }
}

export async function getMessageById({ id }: { id: string }) {
  try {
    const msg = messages.get(id);
    return msg ? [msg] : [];
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message by id"
    );
  }
}

export async function deleteMessagesByChatIdAfterTimestamp({
  chatId,
  timestamp,
}: {
  chatId: string;
  timestamp: Date;
}) {
  try {
    const chatMessages = getMessagesForChat(chatId);
    const messagesToDelete = chatMessages.filter(
      (msg) => msg.createdAt >= timestamp
    );

    const messageIds = messagesToDelete.map((msg) => msg.id);

    // Delete related votes
    for (const [voteKey, vote] of votes.entries()) {
      if (vote.chatId === chatId && messageIds.includes(vote.messageId)) {
        votes.delete(voteKey);
      }
    }

    // Delete messages
    for (const msgId of messageIds) {
      messages.delete(msgId);
    }

    return messagesToDelete;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to delete messages by chat id after timestamp"
    );
  }
}

export async function updateChatVisibilityById({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: "private" | "public";
}) {
  try {
    const chat = chats.get(chatId);
    if (chat) {
      chat.visibility = visibility;
      chats.set(chatId, chat);
      return chat;
    }
    return null;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to update chat visibility by id"
    );
  }
}

export async function updateChatLastContextById({
  chatId,
  context,
}: {
  chatId: string;
  context: AppUsage;
}) {
  try {
    const chat = chats.get(chatId);
    if (chat) {
      chat.lastContext = context;
      chats.set(chatId, chat);
      return chat;
    }
    return null;
  } catch (error) {
    console.warn("Failed to update lastContext for chat", chatId, error);
    return null;
  }
}

export async function getMessageCountByUserId({
  id,
  differenceInHours,
}: {
  id: string;
  differenceInHours: number;
}) {
  try {
    const twentyFourHoursAgo = new Date(
      Date.now() - differenceInHours * 60 * 60 * 1000
    );

    const userChats = getChatsForUser(id);
    const chatIds = userChats.map((c) => c.id);

    let count = 0;
    for (const msg of messages.values()) {
      if (
        chatIds.includes(msg.chatId) &&
        msg.createdAt >= twentyFourHoursAgo &&
        msg.role === "user"
      ) {
        count++;
      }
    }

    return count;
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get message count by user id"
    );
  }
}

export async function createStreamId({
  streamId,
  chatId,
}: {
  streamId: string;
  chatId: string;
}) {
  try {
    const newStream: Stream = {
      id: streamId,
      chatId,
      createdAt: new Date(),
    };

    const existing = streams.get(chatId) || [];
    existing.push(newStream);
    streams.set(chatId, existing);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to create stream id"
    );
  }
}

export async function getStreamIdsByChatId({ chatId }: { chatId: string }) {
  try {
    const streamArray = streams.get(chatId) || [];
    streamArray.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    return streamArray.map((s) => s.id);
  } catch (_error) {
    throw new ChatSDKError(
      "bad_request:database",
      "Failed to get stream ids by chat id"
    );
  }
}
