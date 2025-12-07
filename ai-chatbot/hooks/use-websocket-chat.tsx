"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/types";
import { getWebSocketClient } from "@/lib/websocket/client";
import { generateUUID } from "@/lib/utils";

function hasStatus(m: any): m is { status: string } {
  return m && typeof m.status === "string";
}

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
      switch (message.type) {
        case "status": {
          console.log("Status:", hasStatus(message) ? message.status : undefined);
          break;
        }
        case "think": {
          // Handle thinking status updates
          const status = hasStatus(message) ? message.status : "Thinking...";
          console.log("Think status:", status);
          setThinkingStatus(status);
          setIsThinking(true);
          break;
        }
        case "tool_call":
        case "tool_result": {
          const status = hasStatus(message)
            ? message.status
            : message.type === "tool_call"
            ? "Executing tool..."
            : "Processing tool result...";
          setThinkingStatus(status);
          setIsThinking(true);
          break;
        }
        case "message": {
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
          break;
        }
        case "stream": {
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
              console.log(
                "Adding new message to array, total messages:",
                prev.length + 1
              );
              return [...prev, newMessage];
            });
          }

          // Append delta to current message
          if (delta) {
            currentAssistantMessageRef.current += delta;
            console.log(
              "Current message text length:",
              currentAssistantMessageRef.current.length
            );

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
              console.log(
                "Updated messages, assistant message ID:",
                assistantMessageIdRef.current
              );
              return updated;
            });
          }
          break;
        }
        case "done": {
          // Message is complete
          console.log("Message done, resetting");
          assistantMessageIdRef.current = null;
          currentAssistantMessageRef.current = "";
          break;
        }
        case "error": {
          console.error("Error from backend:", message.message);
          // Reset thinking state on error
          setIsThinking(false);
          setThinkingStatus("Thinking...");
          break;
        }
        default: {
          // No action
        }
      }
    });

    return () => {
      clearInterval(interval);
      unsubscribe();
    };
  }, [setMessages, chatId]);

  return { isConnected, isThinking, setIsThinking, thinkingStatus };
}

