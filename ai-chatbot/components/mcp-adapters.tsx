"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./ui/card";
import { Button } from "./ui/button";

interface MCPAdapter {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: string;
}

const adapters: MCPAdapter[] = [
  {
    id: "mongodb",
    name: "MongoDB",
    description: "Connect and interact with MongoDB databases. Query collections, manage documents, and perform database operations.",
    icon: "🍃",
    category: "Database",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Access and manage your Gmail account. Read emails, send messages, and manage your inbox.",
    icon: "📧",
    category: "Communication",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "Connect to PostgreSQL databases. Execute queries, manage schemas, and interact with your data.",
    icon: "🐘",
    category: "Database",
  },
  {
    id: "github",
    name: "GitHub",
    description: "Interact with GitHub repositories. Manage issues, pull requests, and repository operations.",
    icon: "🐙",
    category: "Development",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Send messages, manage channels, and interact with your Slack workspace.",
    icon: "💬",
    category: "Communication",
  },
  {
    id: "filesystem",
    name: "File System",
    description: "Read and write files, manage directories, and interact with the local file system.",
    icon: "📁",
    category: "System",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Perform web searches using Brave Search API. Get real-time search results and information.",
    icon: "🔍",
    category: "Search",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Control headless browsers, scrape web pages, and automate browser interactions.",
    icon: "🤖",
    category: "Automation",
  },
];

export function MCPAdapters() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.back()}
            className="h-9 w-9"
          >
            <ArrowLeft size={20} />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">MCP Adapters</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Connect and configure Model Context Protocol adapters to extend your AI capabilities
            </p>
          </div>
        </div>

        {/* Adapters Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {adapters.map((adapter) => (
            <Card
              key={adapter.id}
              className="relative flex flex-col transition-all hover:border-primary hover:shadow-md"
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{adapter.icon}</span>
                    <div>
                      <CardTitle className="text-lg">{adapter.name}</CardTitle>
                      <span className="text-xs text-muted-foreground">
                        {adapter.category}
                      </span>
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="flex-1">
                <CardDescription className="text-sm leading-relaxed">
                  {adapter.description}
                </CardDescription>
              </CardContent>
              <div className="absolute right-4 top-4">
                <Button
                  size="sm"
                  variant="default"
                  className="h-7 bg-black px-3 text-xs text-white hover:bg-gray-900 dark:bg-gray-900 dark:hover:bg-gray-800"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Handle adapter connection
                    console.log("Connecting to:", adapter.id);
                    // TODO: Implement connection logic
                  }}
                >
                  Connect
                </Button>
              </div>
            </Card>
          ))}
        </div>

        {/* Empty State (if no adapters) */}
        {adapters.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No MCP adapters available
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              Check back later for new adapter integrations
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

