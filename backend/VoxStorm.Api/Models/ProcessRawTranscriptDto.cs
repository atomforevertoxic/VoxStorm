namespace VoxStorm.Api.Models;

public class ProcessRawTranscriptDto
{
    public string Transcript { get; set; } = string.Empty;
    public int SessionId { get; set; }
}
