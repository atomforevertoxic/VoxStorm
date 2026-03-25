namespace VoxStorm.Api.Services;

public static class LlmServiceFactory
{
    public static ILlmService Create(IConfiguration configuration)
    {
        var provider = configuration["LlmSettings:Provider"]?.ToLower() ?? "groq";

        return provider switch
        {
            "ollama" => new OllamaLlmService(configuration),
            "groq" => new GroqLlmService(configuration),
            _ => new GroqLlmService(configuration)
        };
    }
}
