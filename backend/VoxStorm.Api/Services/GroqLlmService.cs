using System.Net.Http.Json;
using System.Text.Json;
using VoxStorm.Api.Models;

namespace VoxStorm.Api.Services;

public class GroqLlmService : ILlmService
{
    private readonly HttpClient _httpClient;
    private readonly string _apiKey;
    private readonly string _model;

    public GroqLlmService(IConfiguration configuration)
    {
        _httpClient = new HttpClient();
        _apiKey = configuration["LlmSettings:GroqApiKey"] ?? throw new InvalidOperationException("GroqApiKey not configured");
        _model = configuration["LlmSettings:GroqModel"] ?? "llama-3.1-8b-instant";
        _httpClient.DefaultRequestHeaders.Add("Authorization", $"Bearer {_apiKey}");
    }

    public async Task<List<ProcessedIdeaDto>> ProcessTranscriptAsync(string transcript, string centralTheme, int sessionId)
    {
        var prompt = BuildPrompt(transcript, centralTheme);

        var requestBody = new
        {
            model = _model,
            messages = new[]
            {
                new { role = "system", content = "You are a brainstorming assistant that outputs valid JSON only. No explanations, no markdown." },
                new { role = "user", content = prompt }
            },
            temperature = 0.3,
            max_tokens = 500
        };

        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                "https://api.groq.com/openai/v1/chat/completions",
                requestBody
            );

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"Groq API error: {response.StatusCode} - {errorContent}");
                return FallbackToSimpleParsing(transcript);
            }

            var result = await response.Content.ReadFromJsonAsync<GroqResponse>();
            var content = result?.choices?.FirstOrDefault()?.message?.content ?? "";

            return ParseLlmResponse(content);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Groq service error: {ex.Message}");
            return FallbackToSimpleParsing(transcript);
        }
    }

    private string BuildPrompt(string transcript, string centralTheme)
    {
        return $@"Ты — ассистент мозгового штурма. Преобразуй следующий голосовой транскрипт в структурированные идеи.
Каждая идея должна быть одним конкретным, завершенным высказыванием.

Центральная тема: ""{centralTheme}""

Транскрипт: ""{transcript}""

ВАЖНЫЕ ПРАВИЛА:
1. Оцени РЕЛЕВАНТНОСТЬ каждой идеи к центральной теме от 0% до 100%
2. НЕ ПРИДУМЫВАЙ идеи от себя — только то, что есть в транскрипте
3. Если текст не относится к теме (релевантность < 20%) — НЕ включай его в ответ
4. Максимум 5 идей, минимум 0 если ничего не подходит

Формат вывода JSON:
{{
  ""ideas"": [
    {{""text"": ""идея 1"", ""category"": ""opportunity"", ""relevance"": 85}},
    {{""text"": ""идея 2"", ""category"": ""risk"", ""relevance"": 60}}
  ]
}}

Категории на выбор: opportunity (возможность), risk (риск), task (задача), question (вопрос), general (общее)
relevance: число от 0 до 100 — насколько идея связана с центральной темой
Возвращай ТОЛЬКО JSON, без разметки, без объяснений.";
    }

    private List<ProcessedIdeaDto> ParseLlmResponse(string content)
    {
        try
        {
            // Clean markdown if present
            content = content.Trim();
            if (content.StartsWith("```json")) content = content[7..];
            if (content.StartsWith("```")) content = content[3..];
            if (content.EndsWith("```")) content = content[..^3];
            content = content.Trim();

            using var doc = JsonDocument.Parse(content);
            var ideas = new List<ProcessedIdeaDto>();

            if (doc.RootElement.TryGetProperty("ideas", out var ideasArray))
            {
                foreach (var item in ideasArray.EnumerateArray())
                {
                    var relevance = item.TryGetProperty("relevance", out var rel) ? rel.GetInt32() : 100;

                    // Filter out ideas with relevance < 20%
                    if (relevance < 20) continue;

                    var idea = new ProcessedIdeaDto
                    {
                        Text = item.GetProperty("text").GetString() ?? "",
                        Category = item.TryGetProperty("category", out var cat) ? cat.GetString() ?? "general" : "general",
                        ParentIdeaId = null
                    };
                    if (!string.IsNullOrWhiteSpace(idea.Text))
                        ideas.Add(idea);
                }
            }

            return ideas.Count > 0 ? ideas : new List<ProcessedIdeaDto>
            {
                new() { Text = content.Length > 200 ? content[..200] + "..." : content, Category = "general" }
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to parse LLM response: {ex.Message}");
            return FallbackToSimpleParsing(content);
        }
    }

    private List<ProcessedIdeaDto> FallbackToSimpleParsing(string transcript)
    {
        // Simple fallback: split by common separators and create ideas
        var sentences = transcript
            .Split(new[] { '.', '!', '?', '\n', ';' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 5 && s.Length < 200)
            .Take(5)
            .ToList();

        return sentences.Select(s => new ProcessedIdeaDto
        {
            Text = s,
            Category = "general",
            ParentIdeaId = null
        }).ToList();
    }

    private class GroqResponse
    {
        public List<GroqChoice>? choices { get; set; }

        public class GroqChoice
        {
            public GroqMessage? message { get; set; }
        }

        public class GroqMessage
        {
            public string? content { get; set; }
        }
    }
}
