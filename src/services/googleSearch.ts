import axios from 'axios';

export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
}

// Define a type for the items coming from the Google Search API response
interface GoogleSearchItem {
  title: string;
  link: string;
  snippet: string;
  // Add other properties if you need them, but these are the core ones.
}

/**
 * Performs a web search using the Google Custom Search JSON API.
 * @param query The search query.
 * @returns A promise that resolves to an array of search results.
 */
export async function searchOnGoogle(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.LLM_GCP_GOOGLE_SEARCH_API_KEY;
  const engineId = process.env.LLM_GCP_GOOGLE_SEARCH_ENGINE_ID;

  if (!apiKey || !engineId) {
    throw new Error('Google Search API key or engine ID is not configured in environment variables.');
  }

  const url = `https://www.googleapis.com/customsearch/v1`;

  try {
    const response = await axios.get(url, {
      params: {
        key: apiKey,
        cx: engineId,
        q: query,
        num: 5, // Fetch top 5 results
      },
    });

    if (!response.data.items) {
      return [];
    }

    return response.data.items.map((item: GoogleSearchItem) => ({
      title: item.title,
      link: item.link,
      snippet: item.snippet,
    }));

  } catch (error) {
    console.error('Error fetching Google search results:', error);
    return [];
  }
}
