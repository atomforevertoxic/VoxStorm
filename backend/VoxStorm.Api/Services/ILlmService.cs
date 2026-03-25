namespace VoxStorm.Api.Services;

public interface ILlmService
{
    Task<List<ProcessedIdeaDto>> ProcessTranscriptAsync(string transcript, string centralTheme, int sessionId);
}

public class ProcessedIdeaDto
{
    public string Text { get; set; } = string.Empty;
    public string Category { get; set; } = "general";
    public int? ParentIdeaId { get; set; }
}
