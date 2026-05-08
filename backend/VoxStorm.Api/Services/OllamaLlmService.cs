using System.Net.Http.Json;
using System.Text.Json;

namespace VoxStorm.Api.Services;

public class OllamaLlmService : ILlmService
{
    private readonly HttpClient _httpClient;
    private readonly string _baseUrl;
    private readonly string _model;

    public OllamaLlmService(IConfiguration configuration)
    {
        _httpClient = new HttpClient { Timeout = TimeSpan.FromSeconds(60) };
        _baseUrl = configuration["LlmSettings:OllamaUrl"] ?? "http://localhost:11434";
        _model = configuration["LlmSettings:OllamaModel"] ?? "llama3.2:latest";
    }

    public async Task<List<ProcessedIdeaDto>> ProcessTranscriptAsync(string transcript, string centralTheme, int sessionId)
    {
        var prompt = BuildPrompt(transcript, centralTheme);

        var requestBody = new
        {
            model = _model,
            prompt = prompt,
            stream = false,
            options = new
            {
                temperature = 0.3
            }
        };

        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                $"{_baseUrl}/api/generate",
                requestBody
            );

            if (!response.IsSuccessStatusCode)
            {
                var errorContent = await response.Content.ReadAsStringAsync();
                Console.WriteLine($"Ollama API error: {response.StatusCode} - {errorContent}");
                return FallbackToSimpleParsing(transcript);
            }

            var result = await response.Content.ReadFromJsonAsync<OllamaResponse>();
            var content = result?.response ?? "";

            return ParseLlmResponse(content);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Ollama service error: {ex.Message}");
            return FallbackToSimpleParsing(transcript);
        }
    }

    public async Task<ProcessedIdeaDto> CategorizeTextAsync(string text, string centralTheme)
    {
        var prompt = BuildCategorizePrompt(text, centralTheme);

        var requestBody = new
        {
            model = _model,
            prompt = prompt,
            stream = false,
            options = new { temperature = 0.3 }
        };

        try
        {
            var response = await _httpClient.PostAsJsonAsync(
                $"{_baseUrl}/api/generate",
                requestBody
            );

            if (!response.IsSuccessStatusCode)
            {
                return new ProcessedIdeaDto { Text = text, Category = "Общее", Relevance = 100 };
            }

            var result = await response.Content.ReadFromJsonAsync<OllamaResponse>();
            var content = result?.response ?? "";

            return ParseSingleCategorization(content, text);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Ollama categorize error: {ex.Message}");
            return new ProcessedIdeaDto { Text = text, Category = "Общее", Relevance = 100 };
        }
    }

    private string BuildCategorizePrompt(string text, string centralTheme)
    {
        return $@"Определи категорию и релевантность для следующей идеи.

Центральная тема: ""{centralTheme}""

Идея: ""{text}""

Формат вывода JSON (только JSON, ничего больше):
{{""category"": ""Возможность"", ""relevance"": 85}}

Категории (ПИШИ С ЗАГЛАВНОЙ БУКВЫ):
- Возможность (новые идеи, улучшения)
- Риск (потенциальные проблемы)
- Задача (конкретные действия)
- Вопрос (неопределенности для обсуждения)
- Общее (если не подходит под другие)

НЕ ставь ""Общее"" если идея подходит под другие категории!
relevance: от 0 до 100 — насколько идея связана с центральной темой
Возвращай ТОЛЬКО JSON, без разметки.";
    }

    private ProcessedIdeaDto ParseSingleCategorization(string content, string originalText)
    {
        try
        {
            content = content.Trim();
            if (content.StartsWith("```json")) content = content[7..];
            if (content.StartsWith("```")) content = content[3..];
            if (content.EndsWith("```")) content = content[..^3];
            content = content.Trim();

            using var doc = JsonDocument.Parse(content);

            var category = doc.RootElement.TryGetProperty("category", out var cat)
                ? NormalizeCategory(cat.GetString())
                : "Общее";
            var relevance = doc.RootElement.TryGetProperty("relevance", out var rel) ? rel.GetInt32() : 100;

            return new ProcessedIdeaDto
            {
                Text = originalText,
                Category = category,
                Relevance = relevance
            };
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Failed to parse categorization: {ex.Message}");
            return new ProcessedIdeaDto { Text = originalText, Category = "Общее", Relevance = 100 };
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
3. Если текст не относится к теме (релевантность < 60%) — НЕ включай его в ответ
4. Максимум 5 идей, минимум 0 если ничего не подходит

Формат вывода JSON:
{{
  ""ideas"": [
    {{""text"": ""идея 1"", ""category"": ""Возможность"", ""relevance"": 85}},
    {{""text"": ""идея 2"", ""category"": ""Риск"", ""relevance"": 60}}
  ]
}}

Категории (ПИШИ С ЗАГЛАВНОЙ БУКВЫ): Возможность (новые идеи, улучшения), Риск (потенциальные проблемы), Задача (конкретные действия), Вопрос (неопределенности для обсуждения), Общее (остальное)
ОБЯЗАТЕЛЬНО используй разные категории! Не ставь ""Общее"" если идея подходит под другие категории.
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

                    // Filter out ideas with relevance < 60%
                    if (relevance < 60) continue;

                    var idea = new ProcessedIdeaDto
                    {
                        Text = item.GetProperty("text").GetString() ?? "",
                        Category = item.TryGetProperty("category", out var cat)
                            ? NormalizeCategory(cat.GetString())
                            : "Общее",
                        ParentIdeaId = null,
                        Relevance = relevance
                    };
                    if (!string.IsNullOrWhiteSpace(idea.Text))
                        ideas.Add(idea);
                }
            }

            return ideas.Count > 0 ? ideas : new List<ProcessedIdeaDto>
            {
                new() { Text = content.Length > 200 ? content[..200] + "..." : content, Category = "Общее" }
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
        var sentences = transcript
            .Split(new[] { '.', '!', '?', '\n', ';' }, StringSplitOptions.RemoveEmptyEntries)
            .Select(s => s.Trim())
            .Where(s => s.Length > 5 && s.Length < 200)
            .Take(5)
            .ToList();

        return sentences.Select(s => new ProcessedIdeaDto
        {
            Text = s,
            Category = "Общее",
            ParentIdeaId = null
        }).ToList();
    }

    private static string NormalizeCategory(string? category)
    {
        if (string.IsNullOrWhiteSpace(category))
            return "Общее";

        return category.Trim().ToLower() switch
        {
            "general" or "общее" => "Общее",
            "возможность" => "Возможность",
            "риск" => "Риск",
            "задача" => "Задача",
            "вопрос" => "Вопрос",
            _ => char.ToUpper(category.Trim()[0]) + category.Trim()[1..].ToLower()
        };
    }

    private class OllamaResponse
    {
        public string? response { get; set; }
    }
}
