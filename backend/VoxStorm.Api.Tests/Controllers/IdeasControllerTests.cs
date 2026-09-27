using Microsoft.EntityFrameworkCore;
using Moq;
using VoxStorm.Api.Controllers;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;
using VoxStorm.Api.Services;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;

namespace VoxStorm.Api.Tests.Controllers;

public class IdeasControllerTests : IDisposable
{
    private readonly AppDbContext _context;
    private readonly IdeasController _controller;
    private readonly Mock<ILlmService> _llmService;

    public IdeasControllerTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _context = new AppDbContext(options);
        _llmService = new Mock<ILlmService>();
        _controller = new IdeasController(_context, _llmService.Object);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<(Session session, Participant participant)> SeedSessionWithParticipant()
    {
        var session = new Session
        {
            Name = "Test Session",
            CentralTheme = "Test Theme",
            Method = "association",
            Status = "active",
            CreatedAt = DateTime.UtcNow
        };
        var participant = new Participant { Name = "Alice", Session = session };
        session.Participants.Add(participant);
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();
        return (session, participant);
    }

    [Fact]
    public async Task GetIdeas_ReturnsAllIdeas()
    {
        var (session, participant) = await SeedSessionWithParticipant();
        _context.Ideas.AddRange(
            new Idea { Text = "Idea 1", SessionId = session.Id, ParticipantId = participant.Id },
            new Idea { Text = "Idea 2", SessionId = session.Id }
        );
        await _context.SaveChangesAsync();

        var result = await _controller.GetIdeas();

        var ideas = result.Value.Should().BeAssignableTo<IEnumerable<Idea>>().Subject;
        ideas.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetIdea_ExistingId_ReturnsIdea()
    {
        var (session, _) = await SeedSessionWithParticipant();
        var idea = new Idea { Text = "Test idea", SessionId = session.Id, Category = "Задача" };
        _context.Ideas.Add(idea);
        await _context.SaveChangesAsync();

        var result = await _controller.GetIdea(idea.Id);

        var returned = result.Value.Should().BeAssignableTo<Idea>().Subject;
        returned.Text.Should().Be("Test idea");
        returned.Category.Should().Be("Задача");
    }

    // [Fact]
    // public async Task GetIdea_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.GetIdea(999);

    //     result.Result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task PostIdea_ValidDto_CreatesIdea()
    {
        var (session, participant) = await SeedSessionWithParticipant();
        var dto = new CreateIdeaDto
        {
            Text = "New idea from brainstorming",
            SessionId = session.Id,
            ParticipantId = participant.Id,
            Category = "Возможность",
            Relevance = 85
        };

        var result = await _controller.PostIdea(dto);

        var created = result.Result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var idea = created.Value.Should().BeAssignableTo<Idea>().Subject;
        idea.Text.Should().Be("New idea from brainstorming");
        idea.SessionId.Should().Be(session.Id);
        idea.ParticipantId.Should().Be(participant.Id);
        idea.Category.Should().Be("Возможность");
        idea.Relevance.Should().Be(85);
    }

    [Fact]
    public async Task DeleteIdea_ExistingId_DeletesIdea()
    {
        var (session, _) = await SeedSessionWithParticipant();
        var idea = new Idea { Text = "To delete", SessionId = session.Id };
        _context.Ideas.Add(idea);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteIdea(idea.Id);

        result.Should().BeOfType<NoContentResult>();
        _context.Ideas.Should().BeEmpty();
    }

    [Fact]
    public async Task DeleteIdea_NonExistentId_ReturnsNotFound()
    {
        var result = await _controller.DeleteIdea(999);

        result.Should().BeOfType<NotFoundObjectResult>();
    }

    [Fact]
    public async Task DeleteIdea_WithChildIdeas_ReturnsConflict()
    {
        var (session, _) = await SeedSessionWithParticipant();
        var parent = new Idea { Text = "Parent idea", SessionId = session.Id };
        _context.Ideas.Add(parent);
        await _context.SaveChangesAsync();

        var child = new Idea { Text = "Child idea", SessionId = session.Id, ParentIdeaId = parent.Id };
        _context.Ideas.Add(child);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteIdea(parent.Id);

        result.Should().BeOfType<ConflictObjectResult>();
        _context.Ideas.Should().HaveCount(2);
    }

    [Fact]
    public async Task ProcessRawTranscript_ValidTranscript_ReturnsProcessedIdeas()
    {
        var (session, _) = await SeedSessionWithParticipant();
        _llmService.Setup(s => s.ProcessTranscriptAsync("обсуждение инноваций", "Test Theme", session.Id))
            .ReturnsAsync(new List<ProcessedIdeaDto>
            {
                new() { Text = "Идея 1", Category = "Возможность", Relevance = 80 },
                new() { Text = "Идея 2", Category = "Риск", Relevance = 70 }
            });

        var dto = new ProcessRawTranscriptDto { Transcript = "обсуждение инноваций", SessionId = session.Id };

        var result = await _controller.ProcessRawTranscript(dto);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        var response = okResult.Value.Should().BeAssignableTo<ProcessedIdeasResponseDto>().Subject;
        response.Ideas.Should().HaveCount(2);
    }

    [Fact]
    public async Task ProcessRawTranscript_LlmError_Returns500()
    {
        var (session, _) = await SeedSessionWithParticipant();
        _llmService.Setup(s => s.ProcessTranscriptAsync(It.IsAny<string>(), It.IsAny<string>(), It.IsAny<int>()))
            .ThrowsAsync(new Exception("LLM service unavailable"));

        var dto = new ProcessRawTranscriptDto { Transcript = "текст", SessionId = session.Id };

        var result = await _controller.ProcessRawTranscript(dto);

        result.Result.Should().BeOfType<ObjectResult>()
            .Which.StatusCode.Should().Be(500);
    }

    [Fact]
    public async Task CategorizeText_ValidRequest_ReturnsCategorization()
    {
        _llmService.Setup(s => s.CategorizeTextAsync("текст идеи", "тема"))
            .ReturnsAsync(new ProcessedIdeaDto { Text = "текст идеи", Category = "Задача", Relevance = 75 });

        var dto = new CategorizeRequestDto { Text = "текст идеи", CentralTheme = "тема" };

        var result = await _controller.CategorizeText(dto);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        dynamic response = okResult.Value!;
        ((string)response.Category).Should().Be("Задача");
        ((int)response.Relevance).Should().Be(75);
    }

    [Fact]
    public async Task CategorizeText_LlmError_ReturnsDefaultGeneral()
    {
        _llmService.Setup(s => s.CategorizeTextAsync(It.IsAny<string>(), It.IsAny<string>()))
            .ThrowsAsync(new Exception("Error"));

        var dto = new CategorizeRequestDto { Text = "текст", CentralTheme = "тема" };

        var result = await _controller.CategorizeText(dto);

        var okResult = result.Result.Should().BeOfType<OkObjectResult>().Subject;
        dynamic response = okResult.Value!;
        ((string)response.Category).Should().Be("Общее");
        ((int)response.Relevance).Should().Be(100);
    }

    [Fact]
    public async Task UpdatePosition_ExistingIdea_UpdatesCoordinates()
    {
        var (session, _) = await SeedSessionWithParticipant();
        var idea = new Idea { Text = "Idea", SessionId = session.Id };
        _context.Ideas.Add(idea);
        await _context.SaveChangesAsync();

        var dto = new IdeasController.IdeaPositionDto { PositionX = 150.0, PositionY = 300.0 };

        var result = await _controller.UpdatePosition(idea.Id, dto);

        result.Should().BeOfType<NoContentResult>();
        var updated = await _context.Ideas.FindAsync(idea.Id);
        updated!.PositionX.Should().Be(150.0);
        updated.PositionY.Should().Be(300.0);
    }

    // [Fact]
    // public async Task UpdatePosition_NonExistentIdea_ReturnsNotFound()
    // {
    //     var dto = new IdeasController.IdeaPositionDto { PositionX = 100, PositionY = 200 };

    //     var result = await _controller.UpdatePosition(999, dto);

    //     result.Should().BeOfType<NotFoundResult>();
    // }

    // [Fact]
    // public async Task PutIdea_IdMismatch_ReturnsBadRequest()
    // {
    //     var idea = new Idea { Id = 1, Text = "Idea", SessionId = 1 };

    //     var result = await _controller.PutIdea(2, idea);

    //     result.Should().BeOfType<BadRequestResult>();
    // }
}
