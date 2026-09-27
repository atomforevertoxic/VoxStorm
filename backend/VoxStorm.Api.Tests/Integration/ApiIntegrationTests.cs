using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Hosting;
using Microsoft.Data.Sqlite;
using VoxStorm.Api.Data;
using VoxStorm.Api.Services;
using Moq;
using FluentAssertions;

namespace VoxStorm.Api.Tests.Integration;

public class ApiIntegrationTests : IClassFixture<WebApplicationFactory<Program>>, IDisposable
{
    private readonly HttpClient _client;
    private readonly WebApplicationFactory<Program> _factory;
    private readonly Mock<ILlmService> _llmService;
    private readonly SqliteConnection _connection;

    public ApiIntegrationTests(WebApplicationFactory<Program> factory)
    {
        _llmService = new Mock<ILlmService>();
        _connection = new SqliteConnection("Data Source=:memory:");
        _connection.Open();

        _factory = factory.WithWebHostBuilder(builder =>
        {
            builder.UseEnvironment("Testing");

            builder.ConfigureServices(services =>
            {
                var descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(DbContextOptions<AppDbContext>));
                if (descriptor != null) services.Remove(descriptor);
                descriptor = services.SingleOrDefault(d => d.ServiceType == typeof(AppDbContext));
                if (descriptor != null) services.Remove(descriptor);
                var llmDescriptor = services.SingleOrDefault(d => d.ServiceType == typeof(ILlmService));
                if (llmDescriptor != null) services.Remove(llmDescriptor);

                services.AddDbContext<AppDbContext>(options =>
                    options.UseSqlite(_connection));

                services.AddSingleton<ILlmService>(_llmService.Object);
            });
        });

        _client = _factory.CreateClient();

        using var scope = _factory.Services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        db.Database.EnsureCreated();
    }

    public void Dispose()
    {
        _connection.Close();
        _connection.Dispose();
    }

    private async Task<HttpResponseMessage> CreateTestSessionAsync(string name = "Integration Session")
    {
        var dto = new
        {
            Name = name,
            CentralTheme = "Инновации",
            Method = "association",
            Participants = new[]
            {
                new { Name = "Alice" },
                new { Name = "Bob" }
            }
        };
        return await _client.PostAsJsonAsync("/api/sessions", dto);
    }

    [Fact]
    public async Task FullSessionLifecycle_CreateStartCompleteResume()
    {
        // 1. Create session
        var createResponse = await CreateTestSessionAsync();
        createResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();
        sessionId.Should().BeGreaterThan(0);

        // 2. Get session — should be pending
        var getResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        getResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var retrieved = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        retrieved.GetProperty("status").GetString().Should().Be("pending");

        // 3. Start session
        var startResponse = await _client.PutAsJsonAsync($"/api/sessions/{sessionId}", new
        {
            Status = "active",
            StartedAt = DateTime.UtcNow
        });
        startResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 4. Verify started
        getResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        retrieved = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        retrieved.GetProperty("status").GetString().Should().Be("active");

        // 5. Complete session
        var completeResponse = await _client.PutAsJsonAsync($"/api/sessions/{sessionId}", new
        {
            Status = "completed",
            EndedAt = DateTime.UtcNow
        });
        completeResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 6. Verify completed
        getResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        retrieved = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        retrieved.GetProperty("status").GetString().Should().Be("completed");

        // 7. Resume session
        var resumeResponse = await _client.PutAsync($"/api/sessions/{sessionId}/resume", null);
        resumeResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        // 8. Verify resumed
        getResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        retrieved = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        retrieved.GetProperty("status").GetString().Should().Be("pending");
    }

    [Fact]
    public async Task SessionIdeas_CreateAndGetIdeas()
    {
        // Create session
        var createResponse = await CreateTestSessionAsync("Idea Test Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();
        var participants = session.GetProperty("participants").EnumerateArray().ToList();
        var participantId = participants[0].GetProperty("id").GetInt32();

        // Create idea
        var ideaResponse = await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Разработать мобильное приложение",
            SessionId = sessionId,
            ParticipantId = participantId,
            Category = "Задача",
            Relevance = 85
        });
        ideaResponse.StatusCode.Should().Be(HttpStatusCode.Created);
        var idea = await ideaResponse.Content.ReadFromJsonAsync<JsonElement>();
        idea.GetProperty("text").GetString().Should().Be("Разработать мобильное приложение");
        idea.GetProperty("category").GetString().Should().Be("Задача");
        idea.GetProperty("relevance").GetInt32().Should().Be(85);

        // Get idea by id
        var ideaId = idea.GetProperty("id").GetInt32();
        var getIdeaResponse = await _client.GetAsync($"/api/ideas/{ideaId}");
        getIdeaResponse.StatusCode.Should().Be(HttpStatusCode.OK);
        var retrievedIdea = await getIdeaResponse.Content.ReadFromJsonAsync<JsonElement>();
        retrievedIdea.GetProperty("text").GetString().Should().Be("Разработать мобильное приложение");

        // Verify idea appears in session
        var sessionResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        var sessionData = await sessionResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ideas = sessionData.GetProperty("ideas").EnumerateArray().ToList();
        ideas.Should().HaveCount(1);
    }

    [Fact]
    public async Task DeleteIdea_RemovesFromSession()
    {
        var createResponse = await CreateTestSessionAsync("Delete Idea Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();

        var ideaResponse = await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Idea to delete",
            SessionId = sessionId,
            Category = "Общее"
        });
        var idea = await ideaResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ideaId = idea.GetProperty("id").GetInt32();

        var deleteResponse = await _client.DeleteAsync($"/api/ideas/{ideaId}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getDeletedResponse = await _client.GetAsync($"/api/ideas/{ideaId}");
        getDeletedResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task DeleteIdea_WithChild_ReturnsConflict()
    {
        var createResponse = await CreateTestSessionAsync("Parent Idea Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();

        var parentResponse = await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Parent idea",
            SessionId = sessionId,
            Category = "Общее"
        });
        var parentIdea = await parentResponse.Content.ReadFromJsonAsync<JsonElement>();
        var parentId = parentIdea.GetProperty("id").GetInt32();

        var childResponse = await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Child idea",
            SessionId = sessionId,
            Category = "Общее",
            ParentIdeaId = parentId
        });
        childResponse.StatusCode.Should().Be(HttpStatusCode.Created);

        var deleteResponse = await _client.DeleteAsync($"/api/ideas/{parentId}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.Conflict);

        var getParentResponse = await _client.GetAsync($"/api/ideas/{parentId}");
        getParentResponse.StatusCode.Should().Be(HttpStatusCode.OK);
    }

    [Fact]
    public async Task DeleteSession_CascadesDeletes()
    {
        var createResponse = await CreateTestSessionAsync("Cascade Delete Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();
        var participantId = session.GetProperty("participants").EnumerateArray().First().GetProperty("id").GetInt32();

        await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Idea in cascade session",
            SessionId = sessionId,
            ParticipantId = participantId
        });

        var deleteResponse = await _client.DeleteAsync($"/api/sessions/{sessionId}");
        deleteResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getSessionResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        getSessionResponse.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task ProcessRawTranscript_ReturnsProcessedIdeas()
    {
        var createResponse = await CreateTestSessionAsync("LLM Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();

        _llmService.Setup(s => s.ProcessTranscriptAsync(
                "давайте внедрим нейросеть для анализа данных",
                "Инновации",
                sessionId))
            .ReturnsAsync(new List<ProcessedIdeaDto>
            {
                new() { Text = "Внедрить нейросеть для анализа данных", Category = "Возможность", Relevance = 90 },
                new() { Text = "Обучить команду работе с AI", Category = "Задача", Relevance = 75 }
            });

        var processResponse = await _client.PostAsJsonAsync("/api/ideas/process-raw", new
        {
            Transcript = "давайте внедрим нейросеть для анализа данных",
            SessionId = sessionId
        });
        processResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await processResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ideas = result.GetProperty("ideas").EnumerateArray().ToList();
        ideas.Should().HaveCount(2);
        ideas[0].GetProperty("text").GetString().Should().Be("Внедрить нейросеть для анализа данных");
        ideas[0].GetProperty("category").GetString().Should().Be("Возможность");
        ideas[1].GetProperty("category").GetString().Should().Be("Задача");
    }

    [Fact]
    public async Task Categorize_ReturnsCategory()
    {
        _llmService.Setup(s => s.CategorizeTextAsync("улучшить UI дизайн", "дизайн"))
            .ReturnsAsync(new ProcessedIdeaDto
            {
                Text = "улучшить UI дизайн",
                Category = "Возможность",
                Relevance = 88
            });

        var response = await _client.PostAsJsonAsync("/api/ideas/categorize", new
        {
            Text = "улучшить UI дизайн",
            CentralTheme = "дизайн"
        });
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        result.GetProperty("category").GetString().Should().Be("Возможность");
        result.GetProperty("relevance").GetInt32().Should().Be(88);
    }

    [Fact]
    public async Task GetCompletedSessions_ReturnsOnlyCompleted()
    {
        var create1 = await CreateTestSessionAsync("Active Session");
        var activeSession = await create1.Content.ReadFromJsonAsync<JsonElement>();
        var activeId = activeSession.GetProperty("id").GetInt32();

        var create2 = await CreateTestSessionAsync("Completed Session");
        var completedSession = await create2.Content.ReadFromJsonAsync<JsonElement>();
        var completedId = completedSession.GetProperty("id").GetInt32();

        await _client.PutAsJsonAsync($"/api/sessions/{completedId}", new
        {
            Status = "completed",
            EndedAt = DateTime.UtcNow
        });

        var response = await _client.GetAsync("/api/sessions/completed");
        response.StatusCode.Should().Be(HttpStatusCode.OK);

        var result = await response.Content.ReadFromJsonAsync<JsonElement>();
        var sessions = result.EnumerateArray().ToList();
        sessions.Should().HaveCount(1);
        sessions[0].GetProperty("name").GetString().Should().Be("Completed Session");
    }

    [Fact]
    public async Task GetSessionStats_ReturnsCorrectStatistics()
    {
        var createResponse = await CreateTestSessionAsync("Stats Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();
        var participants = session.GetProperty("participants").EnumerateArray().ToList();
        var p1Id = participants[0].GetProperty("id").GetInt32();
        var p2Id = participants[1].GetProperty("id").GetInt32();

        // Add ideas
        await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Idea 1", SessionId = sessionId, ParticipantId = p1Id, Category = "Возможность", Relevance = 90
        });
        await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Idea 2", SessionId = sessionId, ParticipantId = p2Id, Category = "Риск", Relevance = 70
        });

        // Start and complete
        await _client.PutAsJsonAsync($"/api/sessions/{sessionId}", new
        {
            Status = "active",
            StartedAt = DateTime.UtcNow.AddMinutes(-30)
        });
        await _client.PutAsJsonAsync($"/api/sessions/{sessionId}", new
        {
            Status = "completed",
            EndedAt = DateTime.UtcNow
        });

        var statsResponse = await _client.GetAsync($"/api/sessions/{sessionId}/stats");
        statsResponse.StatusCode.Should().Be(HttpStatusCode.OK);

        var stats = await statsResponse.Content.ReadFromJsonAsync<JsonElement>();
        stats.GetProperty("totalIdeas").GetInt32().Should().Be(2);
        stats.GetProperty("participantCount").GetInt32().Should().Be(2);
        stats.GetProperty("status").GetString().Should().Be("completed");
        stats.GetProperty("durationSeconds").GetInt32().Should().BeGreaterThan(0);
    }

    [Fact]
    public async Task UpdateIdeaPosition_SavesCoordinates()
    {
        var createResponse = await CreateTestSessionAsync("Position Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();

        var ideaResponse = await _client.PostAsJsonAsync("/api/ideas", new
        {
            Text = "Positioned idea",
            SessionId = sessionId
        });
        var idea = await ideaResponse.Content.ReadFromJsonAsync<JsonElement>();
        var ideaId = idea.GetProperty("id").GetInt32();

        var updateResponse = await _client.PutAsJsonAsync($"/api/ideas/{ideaId}/position", new
        {
            PositionX = 250.5,
            PositionY = 100.0
        });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await _client.GetAsync($"/api/ideas/{ideaId}");
        var updated = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        updated.GetProperty("positionX").GetDouble().Should().Be(250.5);
        updated.GetProperty("positionY").GetDouble().Should().Be(100.0);
    }

    [Fact]
    public async Task UpdateCenterPosition_SavesCoordinates()
    {
        var createResponse = await CreateTestSessionAsync("Center Position Session");
        var session = await createResponse.Content.ReadFromJsonAsync<JsonElement>();
        var sessionId = session.GetProperty("id").GetInt32();

        var updateResponse = await _client.PutAsJsonAsync($"/api/sessions/{sessionId}/center-position", new
        {
            PositionX = 500.0,
            PositionY = 300.0
        });
        updateResponse.StatusCode.Should().Be(HttpStatusCode.NoContent);

        var getResponse = await _client.GetAsync($"/api/sessions/{sessionId}");
        var updated = await getResponse.Content.ReadFromJsonAsync<JsonElement>();
        updated.GetProperty("centerPositionX").GetDouble().Should().Be(500.0);
        updated.GetProperty("centerPositionY").GetDouble().Should().Be(300.0);
    }

    [Fact]
    public async Task NonExistentSession_Returns404()
    {
        var response = await _client.GetAsync("/api/sessions/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }

    [Fact]
    public async Task NonExistentIdea_Returns404()
    {
        var response = await _client.GetAsync("/api/ideas/99999");
        response.StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
