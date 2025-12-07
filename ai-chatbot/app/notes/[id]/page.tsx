"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotebookViewer } from "@/components/notebook-viewer";
import { ArrowLeftIcon, BookOpenIcon } from "lucide-react";

interface Notebook {
  _id: string;
  notebook_name: string;
  created_at: string;
  pages: Array<{
    page_index: number;
    page_metadata: any;
    extracted_items: Array<{
      type: string;
      symbol: string;
      status: string;
      time: string;
      content: string;
      metadata: any;
    }>;
  }>;
  markdown_export: string;
}

export default function NotebookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Try to get notebook from sessionStorage first (for immediate display)
    const storedNotebook = sessionStorage.getItem('selectedNotebook');
    if (storedNotebook) {
      try {
        const parsedNotebook = JSON.parse(storedNotebook);
        setNotebook(parsedNotebook);
        setLoading(false);
      } catch (error) {
        console.error('Error parsing stored notebook:', error);
      }
    }

    // Since the individual notebook endpoint doesn't exist, 
    // we'll rely on sessionStorage and the all_notebooks endpoint
    if (!storedNotebook && params.id) {
      // Fallback: fetch all notebooks and find the one we need
      fetch("http://localhost:8000/all_notebooks")
        .then(res => res.json())
        .then(data => {
          const foundNotebook = (data.notebooks || []).find((nb: any) => nb._id === params.id);
          if (foundNotebook) {
            setNotebook(foundNotebook);
          }
        })
        .catch(error => {
          console.error('Error fetching notebooks:', error);
        })
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50">
        {/* Header Shimmer */}
        <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b shadow-sm">
          <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
            <div className="w-20 h-8 bg-gray-200 rounded animate-pulse"></div>
            <div className="flex items-center gap-2 flex-1">
              <div className="w-5 h-5 bg-gray-200 rounded animate-pulse"></div>
              <div className="w-48 h-6 bg-gray-200 rounded animate-pulse"></div>
            </div>
            <div className="w-24 h-4 bg-gray-200 rounded animate-pulse"></div>
          </div>
        </header>

        {/* Main Content Shimmer */}
        <main className="max-w-6xl mx-auto px-4 py-6">
          <div className="bg-white rounded-lg shadow-sm border">
            <div className="p-6 space-y-6">
              {/* Title shimmer */}
              <div className="w-3/4 h-8 bg-gray-200 rounded animate-pulse"></div>
              
              {/* Content blocks shimmer */}
              <div className="space-y-4">
                <div className="w-1/2 h-6 bg-gray-200 rounded animate-pulse"></div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-5/6 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-4/5 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
                
                <div className="w-1/2 h-6 bg-gray-200 rounded animate-pulse mt-6"></div>
                <div className="space-y-2">
                  <div className="w-full h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-4/5 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-5/6 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
                
                <div className="w-1/3 h-6 bg-gray-200 rounded animate-pulse mt-6"></div>
                <div className="space-y-2">
                  <div className="w-3/4 h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-full h-4 bg-gray-200 rounded animate-pulse"></div>
                  <div className="w-2/3 h-4 bg-gray-200 rounded animate-pulse"></div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!notebook) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 mb-4">Notebook not found</div>
          <Button onClick={() => router.push('/notes')}>
            <ArrowLeftIcon className="w-4 h-4 mr-2" />
            Back to Notes
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Header */}
      <header className="sticky top-0 z-20 bg-white/90 backdrop-blur border-b shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-4">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => router.push('/notes')}
            className="flex items-center gap-2"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Back to Notes
          </Button>
          
          <div className="flex items-center gap-2 flex-1">
            <BookOpenIcon className="w-5 h-5 text-indigo-600" />
            <h1 className="font-semibold text-lg text-gray-800 truncate">
              {notebook.notebook_name}
            </h1>
          </div>
          
          <div className="text-sm text-gray-500">
            {new Date(notebook.created_at).toLocaleDateString()}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-6">
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6">
            <NotebookViewer text={JSON.stringify(notebook)} />
          </div>
        </div>
      </main>
    </div>
  );
}
