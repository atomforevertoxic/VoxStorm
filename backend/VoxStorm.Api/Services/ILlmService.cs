namespace VoxStorm.Api.Services;

public interface ILlmService
{
    Task<List<ProcessedIdeaDto>> ProcessTranscriptAsync(string transcript, string centralTheme, int sessionId);
    Task<ProcessedIdeaDto> CategorizeTextAsync(string text, string centralTheme);
}

public class ProcessedIdeaDto
{
    public string Text { get; set; } = string.Empty;
    public string Category { get; set; } = "Общее";
    public int? ParentIdeaId { get; set; }
    public int Relevance { get; set; } = 100;
}
