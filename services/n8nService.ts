
export class N8nService {
  /**
   * Sends a message to a specific n8n workflow.
   * Expects the workflow to accept POST with { message, sessionId }.
   */
  static async sendMessage(webhookUrl: string, message: string, sessionId: string): Promise<string> {
    if (!webhookUrl) {
      throw new Error("n8n Webhook URL is not configured. Please set it in the Settings panel.");
    }

    let response: Response;
    try {
      response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/plain, */*',
        },
        body: JSON.stringify({
          message,
          sessionId
        }),
      });
    } catch (error) {
      // "Failed to fetch" usually indicates a CORS issue or network error
      console.error("Network error or CORS block:", error);
      throw new Error("Could not connect to n8n. This is likely a CORS issue. Ensure your n8n instance allows requests from this origin or check your internet connection.");
    }

    const responseText = await response.text();

    if (!response.ok) {
      throw new Error(`n8n Error (${response.status}): ${responseText || response.statusText}`);
    }

    if (!responseText || responseText.trim() === '') {
      return "Workflow executed successfully, but returned no content.";
    }

    try {
      const data = JSON.parse(responseText);

      // n8n Webhook responses can vary. 
      // Often it's an array with one object [{ output: "..." }]
      // Or a single object { output: "..." }
      
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0];
        return first.output || first.response || first.message || first.text || (typeof first === 'string' ? first : JSON.stringify(first));
      }
      
      if (typeof data === 'object' && data !== null) {
        return data.output || data.response || data.message || data.text || JSON.stringify(data);
      }

      return String(data);
    } catch (e) {
      // If it's not JSON, return the raw text
      return responseText;
    }
  }
}
