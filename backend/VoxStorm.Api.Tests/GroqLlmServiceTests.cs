using System.Net;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Configuration;
using Moq;
using Moq.Protected;
using VoxStorm.Api.Services;
using FluentAssertions;

namespace VoxStorm.Api.Tests;

public class GroqLlmServiceTests
{
    private readonly Mock<IConfiguration> _config;

    public GroqLlmServiceTests()
    {
        _config = new Mock<IConfiguration>();
        _config.Setup(c => c["LlmSettings:GroqApiKey"]).Returns("test-key");
        _config.Setup(c => c["LlmSettings:GroqModel"]).Returns("test-model");
    }

    private GroqLlmService CreateService(HttpResponseMessage responseMessage)
    {
        var handler = new Mock<HttpMessageHandler>();
        handler.Protected()
            .Setup<Task<HttpResponseMessage>>("SendAsync",
                ItExpr.IsAny<HttpRequestMessage>(),
                ItExpr.IsAny<CancellationToken>())
            .ReturnsAsync(responseMessage);

        var service = new GroqLlmService(_config.Object);
        var clientField = typeof(GroqLlmService).GetField("_httpClient",
            System.Reflection.BindingFlags.NonPublic | System.Reflection.BindingFlags.Instance)!;
        var client = (HttpClient)clientField.GetValue(service)!;
        client = new HttpClient(handler.Object)
        {
            DefaultRequestHeaders = { { "Authorization", "Bearer test-key" } }
        };
        clientField.SetValue(service, client);
        return service;
    }

    [Fact]
    public async Task ProcessTranscriptAsync_ValidJson_ReturnsIdeas()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        content = JsonSerializer.Serialize(new
                        {
                            ideas = new[]
                            {
                                new { text = "Использовать AI для анализа", category = "Возможность", relevance = 85 },
                                new { text = "Высокие затраты на серверы", category = "Риск", relevance = 70 }
                            }
                        })
                    }
                }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("транскрипт обсуждения", "инновации", 1);

        result.Should().HaveCount(2);
        result[0].Text.Should().Be("Использовать AI для анализа");
        result[0].Category.Should().Be("Возможность");
        result[0].Relevance.Should().Be(85);
        result[1].Category.Should().Be("Риск");
    }

    [Fact]
    public async Task ProcessTranscriptAsync_FiltersLowRelevance()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        content = JsonSerializer.Serialize(new
                        {
                            ideas = new[]
                            {
                                new { text = "Хорошая идея", category = "Задача", relevance = 80 },
                                new { text = "Нерелевантная идея", category = "Общее", relevance = 30 }
                            }
                        })
                    }
                }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().HaveCount(1);
        result[0].Text.Should().Be("Хорошая идея");
        result[0].Relevance.Should().Be(80);
    }

    [Fact]
    public async Task ProcessTranscriptAsync_ApiError_FallsBackToSimpleParsing()
    {
        var service = CreateService(new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("error")
        });

        var result = await service.ProcessTranscriptAsync(
            "Первое предложение. Второе предложение про что-то важное! Третье предложение тоже здесь", "тема", 1);

        result.Should().NotBeEmpty();
        result.All(i => i.Category == "Общее").Should().BeTrue();
    }

    [Fact]
    public async Task ProcessTranscriptAsync_EmptyIdeasArray_ReturnsFallback()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new { message = new { content = "{\"ideas\": []}" } }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().NotBeEmpty();
    }

    [Fact]
    public async Task ProcessTranscriptAsync_MarkdownJson_ParsesCorrectly()
    {
        var rawContent = "```json\n{\"ideas\":[{\"text\":\"Идея из markdown\",\"category\":\"Вопрос\",\"relevance\":75}]}\n```";
        var llmResponse = new
        {
            choices = new[] { new { message = new { content = rawContent } } }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().HaveCount(1);
        result[0].Text.Should().Be("Идея из markdown");
        result[0].Category.Should().Be("Вопрос");
    }

    [Fact]
    public async Task CategorizeTextAsync_ValidResponse_ReturnsCategory()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new { message = new { content = "{\"category\": \"Риск\", \"relevance\": 90}" } }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.CategorizeTextAsync("Потенциальная проблема с безопасностью", "безопасность");

        result.Category.Should().Be("Риск");
        result.Relevance.Should().Be(90);
        result.Text.Should().Be("Потенциальная проблема с безопасностью");
    }

    [Fact]
    public async Task CategorizeTextAsync_ApiError_ReturnsDefaultGeneral()
    {
        var service = CreateService(new HttpResponseMessage(HttpStatusCode.InternalServerError)
        {
            Content = new StringContent("error")
        });

        var result = await service.CategorizeTextAsync("какой-то текст", "тема");

        result.Category.Should().Be("Общее");
        result.Relevance.Should().Be(100);
    }

    [Fact]
    public async Task CategorizeTextAsync_InvalidJson_ReturnsDefaultGeneral()
    {
        var llmResponse = new
        {
            choices = new[] { new { message = new { content = "not valid json at all" } } }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.CategorizeTextAsync("текст", "тема");

        result.Category.Should().Be("Общее");
        result.Relevance.Should().Be(100);
    }

    [Fact]
    public async Task ProcessTranscriptAsync_LowercaseCategory_NormalizesToCapitalized()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        content = JsonSerializer.Serialize(new
                        {
                            ideas = new[]
                            {
                                new { text = "Идея", category = "риск", relevance = 70 }
                            }
                        })
                    }
                }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().HaveCount(1);
        result[0].Category.Should().Be("Риск");
    }

    [Fact]
    public async Task ProcessTranscriptAsync_EnglishCategoryGeneral_NormalizesToRussian()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        content = JsonSerializer.Serialize(new
                        {
                            ideas = new[]
                            {
                                new { text = "Some idea", category = "general", relevance = 75 }
                            }
                        })
                    }
                }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("text", "theme", 1);

        result.Should().HaveCount(1);
        result[0].Category.Should().Be("Общее");
    }

    [Fact]
    public async Task ProcessTranscriptAsync_EmptyTextIdea_Skipped()
    {
        var llmResponse = new
        {
            choices = new[]
            {
                new
                {
                    message = new
                    {
                        content = JsonSerializer.Serialize(new
                        {
                            ideas = new[]
                            {
                                new { text = "", category = "Общее", relevance = 80 },
                                new { text = "   ", category = "Общее", relevance = 80 },
                                new { text = "Нормальная идея", category = "Задача", relevance = 70 }
                            }
                        })
                    }
                }
            }
        };

        var service = CreateService(new HttpResponseMessage(HttpStatusCode.OK)
        {
            Content = new StringContent(JsonSerializer.Serialize(llmResponse), Encoding.UTF8, "application/json")
        });

        var result = await service.ProcessTranscriptAsync("текст", "тема", 1);

        result.Should().HaveCount(1);
        result[0].Text.Should().Be("Нормальная идея");
    }
}
