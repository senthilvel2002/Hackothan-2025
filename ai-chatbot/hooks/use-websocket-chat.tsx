"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { getWebSocketClient } from "@/lib/websocket/client";
import { generateUUID } from "@/lib/utils";

export function useWebSocketChat({
  setMessages,
  chatId,
}: {
  setMessages: (messages: ChatMessage[] | ((prev: ChatMessage[]) => ChatMessage[])) => void;
  chatId: string;
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingStatus, setThinkingStatus] = useState<string>("Thinking...");
  const currentAssistantMessageRef = useRef<string>("");
  const assistantMessageIdRef = useRef<string | null>(null);

  useEffect(() => {
    const wsClient = getWebSocketClient();

    // Ensure connection is established
    wsClient.connect().catch((error) => {
      console.warn("WebSocket connection attempt failed:", error);
    });

    // Check connection status
    const checkConnection = () => {
      const connected = wsClient.isConnected();
      setIsConnected(connected);
      if (!connected) {
        // Try to reconnect if not connected
        wsClient.connect().catch(() => {
          // Silent fail, will retry on next interval
        });
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 2000);

    // Handle incoming messages
    const unsubscribe = wsClient.onMessage((message) => {
      console.log("WebSocket message received:", message);

      if (message.type === "status") {
        // Handle status updates (e.g., "thinking", "searching")
        console.log("Status:", message.status);
      } else if (message.type === "think") {
        // Handle thinking status updates
        const status = message.status || "Thinking...";
        console.log("Think status:", status);
        setThinkingStatus(status);
        setIsThinking(true);
      } else if (message.type === "message") {
        // Handle complete message (non-streaming)
        const fullMessage = message.message || "";
        console.log("Complete message received:", fullMessage);

        // Stop thinking indicator
        setIsThinking(false);
        setThinkingStatus("Thinking...");

        if (!assistantMessageIdRef.current) {
          // Create new assistant message
          const messageId = generateUUID();
          assistantMessageIdRef.current = messageId;
          currentAssistantMessageRef.current = fullMessage;

          console.log("Creating new assistant message:", messageId);
          setMessages((prev) => {
            const newMessage = {
              id: messageId,
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: fullMessage }],
              metadata: {
                createdAt: new Date().toISOString(),
              },
            };
            console.log("Adding complete message to array");
            return [...prev, newMessage];
          });
        } else {
          // Update existing message
          currentAssistantMessageRef.current = fullMessage;
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === assistantMessageIdRef.current
                ? {
                  ...msg,
                  parts: [
                    {
                      type: "text" as const,
                      text: fullMessage,
                    },
                  ],
                }
                : msg
            );
            return updated;
          });
        }

        // Reset for next message
        assistantMessageIdRef.current = null;
        currentAssistantMessageRef.current = "";
      } else if (message.type === "stream") {
        const delta = message.message_delta || "";
        console.log("Stream delta received:", delta);

        // Stop thinking indicator when stream starts
        setIsThinking(false);
        setThinkingStatus("Thinking...");

        // Handle streaming text deltas
        if (!assistantMessageIdRef.current) {
          // Create new assistant message
          const messageId = generateUUID();
          assistantMessageIdRef.current = messageId;
          currentAssistantMessageRef.current = "";

          console.log("Creating new assistant message:", messageId);
          setMessages((prev) => {
            const newMessage = {
              id: messageId,
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: "" }],
              metadata: {
                createdAt: new Date().toISOString(),
              },
            };
            console.log("Adding new message to array, total messages:", prev.length + 1);
            return [...prev, newMessage];
          });
        }

        // Append delta to current message
        if (delta) {
          currentAssistantMessageRef.current += delta;
          console.log("Current message text length:", currentAssistantMessageRef.current.length);

          // Update the assistant message
          setMessages((prev) => {
            const updated = prev.map((msg) =>
              msg.id === assistantMessageIdRef.current
                ? {
                  ...msg,
                  parts: [
                    {
                      type: "text" as const,
                      text: currentAssistantMessageRef.current,
                    },
                  ],
                }
                : msg
            );
            console.log("Updated messages, assistant message ID:", assistantMessageIdRef.current);
            return updated;
          });
        }
      } else if (message.type === "done") {
        // Message is complete
        console.log("Message done, resetting");
        assistantMessageIdRef.current = null;
        currentAssistantMessageRef.current = "";
      } else if (message.type === "tool_call") {
        console.log("Tool call:", message.status);
      } else if (message.type === "tool_result") {
        console.log("Tool result:", message.status);
      } else if (message.type === "error") {
        console.error("Error from backend:", message.message);
        // Reset thinking state on error
        setIsThinking(false);
        setThinkingStatus("Thinking...");
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [setMessages, chatId]);

  return { isConnected, isThinking, setIsThinking, thinkingStatus };
}

