namespace VoxStorm.Api.Models
{
    public class CreateIdeaDto
    {
        public string Text { get; set; } = string.Empty;
        public int SessionId { get; set; }
        public int? ParticipantId { get; set; }
        public string? Category { get; set; }
        public int? ParentIdeaId { get; set; }
    }
}
