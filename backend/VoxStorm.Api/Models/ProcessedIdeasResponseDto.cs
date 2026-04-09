namespace VoxStorm.Api.Models;

public class ProcessedIdeasResponseDto
{
    public List<IdeaDto> Ideas { get; set; } = new();
}

public class IdeaDto
{
    public string Text { get; set; } = string.Empty;
    public string Category { get; set; } = "Общее";
    public int? ParentIdeaId { get; set; }
    public int Relevance { get; set; } = 100;
}
