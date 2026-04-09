namespace VoxStorm.Api.Models;

public class CategorizeRequestDto
{
    public string Text { get; set; } = string.Empty;
    public string CentralTheme { get; set; } = string.Empty;
}

public class CategorizeResponseDto
{
    public string Category { get; set; } = "Общее";
    public int Relevance { get; set; } = 100;
}
