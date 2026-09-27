using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Moq;
using Moq.Protected;
using VoxStorm.Api.Services;
using FluentAssertions;

namespace VoxStorm.Api.Tests;

public class OllamaLlmServiceTests
{
    private readonly Mock<IConfiguration> _config;

    public OllamaLlmServiceTests()
    {
        _config = new Mock<IConfiguration>();
        _config.Setup(c => c["LlmSettings:OllamaUrl"]).Returns("http://localhost:11434");
        _config.Setup(c => c["LlmSettings:OllamaModel"]).Returns("test-model");
    }

    private OllamaLlmService CreateService(HttpResponseMessage responseMessage)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(responseMessage);

        var service = new OllamaLlmService(_config.Object);
        var clientField = typeof(OllamaLlmService).GetField("_httpClient",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        clientField.SetValue(service, new HttpClient(handler.Object));
        return service;
    }

    [Fact]
    public async Task ProcessTranscriptAsync_ValidJson_ReturnsIdeas()
    {
        var ollamaResponse = new
        {
            response = JsonSerializer.Serialize(new
            {
                ideas = new[]
                {
                    new { text = "Оптимизировать процесс", category = "Задача", relevance = 90 },
                    new { text = "Нехватка ресурсов", category = "Риск", relevance = 65 }
                }
            })
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(ollamaResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("обсуждение", "оптимизация", 1);

        result.Should().HaveCount(2);
        result[0].Category.Should().Be("Задача");
        result[1].Category.Should().Be("Риск");
    }

    [Fact]
    public async Task ProcessTranscriptAsync_ApiError_FallsBackToSimpleParsing()
    {
        var service = CreateService(new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("error")
        });

        var result = await service.ProcessTranscriptAsync(
            "Разработка плана. Тестирование нового модуля! Анализ рисков", "тема", 1);

        result.Should().NotBeEmpty();
        result.All(i => i.Category == "Общее").Should().BeTrue();
    }

    [Fact]
    public async Task CategorizeTextAsync_ValidResponse_ReturnsCategory()
    {
        var ollamaResponse = new
        {
            response = "{\"category\": \"Возможность\", \"relevance\": 95}"
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(ollamaResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.CategorizeTextAsync("Новая маркетинговая стратегия", "маркетинг");

        result.Category.Should().Be("Возможность");
        result.Relevance.Should().Be(95);
    }

    [Fact]
    public async Task CategorizeTextAsync_ApiError_ReturnsDefaultGeneral()
    {
        var service = CreateService(new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            Content = new StringContent("unavailable")
        });

        var result = await service.CategorizeTextAsync("текст", "тема");

        result.Category.Should().Be("Общее");
        result.Relevance.Should().Be(100);
    }

    [Fact]
    public async Task CategorizeTextAsync_MarkdownWrappedJson_ParsesCorrectly()
    {
        var ollamaResponse = new
        {
            response = "```json\n{\"category\": \"Вопрос\", \"relevance\": 60}\n```"
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(ollamaResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.CategorizeTextAsync("Как быть с бюджетом?", "бюджет");

        result.Category.Should().Be("Вопрос");
        result.Relevance.Should().Be(60);
    }

    [Fact]
    public async Task ProcessTranscriptAsync_FiltersLowRelevance()
    {
        var ollamaResponse = new
        {
            response = JsonSerializer.Serialize(new
            {
                ideas = new[]
                {
                    new { text = "Релевантная идея", category = "Возможность", relevance = 80 },
                    new { text = "Нерелевантная", category = "Общее", relevance = 40 }
                }
            })
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(ollamaResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().HaveCount(1);
        result[0].Relevance.Should().Be(80);
    }
}
