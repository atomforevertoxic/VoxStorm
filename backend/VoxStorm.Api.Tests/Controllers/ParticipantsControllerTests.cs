using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Controllers;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;

namespace VoxStorm.Api.Tests.Controllers;

public class ParticipantsControllerTests : IDisposable
{
    private readonly AppDbContext _context;
    private readonly ParticipantsController _controller;

    public ParticipantsControllerTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _context = new AppDbContext(options);
        _controller = new ParticipantsController(_context);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private async Task<Session> SeedSession()
    {
        var session = new Session
        {
            Name = "Test Session",
            CentralTheme = "Theme",
            Method = "association",
            Status = "pending",
            CreatedAt = DateTime.UtcNow
        };
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();
        return session;
    }

    [Fact]
    public async Task GetParticipants_ReturnsAllParticipants()
    {
        var session = await SeedSession();
        _context.Participants.AddRange(
            new Participant { Name = "Alice", SessionId = session.Id },
            new Participant { Name = "Bob", SessionId = session.Id }
        );
        await _context.SaveChangesAsync();

        var result = await _controller.GetParticipants();

        var participants = result.Value.Should().BeAssignableTo<IEnumerable<Participant>>().Subject;
        participants.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetParticipant_ExistingId_ReturnsParticipant()
    {
        var session = await SeedSession();
        var participant = new Participant { Name = "Alice", SessionId = session.Id };
        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();

        var result = await _controller.GetParticipant(participant.Id);

        var returned = result.Value.Should().BeAssignableTo<Participant>().Subject;
        returned.Name.Should().Be("Alice");
    }

    // [Fact]
    // public async Task GetParticipant_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.GetParticipant(999);

    //     result.Result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task PostParticipant_ValidParticipant_CreatesParticipant()
    {
        var session = await SeedSession();
        var participant = new Participant { Name = "Charlie", SessionId = session.Id };

        var result = await _controller.PostParticipant(participant);

        var created = result.Result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var returned = created.Value.Should().BeAssignableTo<Participant>().Subject;
        returned.Name.Should().Be("Charlie");
        returned.SessionId.Should().Be(session.Id);
    }

    [Fact]
    public async Task DeleteParticipant_ExistingId_DeletesParticipant()
    {
        var session = await SeedSession();
        var participant = new Participant { Name = "Alice", SessionId = session.Id };
        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteParticipant(participant.Id);

        result.Should().BeOfType<NoContentResult>();
        _context.Participants.Should().BeEmpty();
    }

    // [Fact]
    // public async Task DeleteParticipant_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.DeleteParticipant(999);

    //     result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task DeleteParticipant_IdeaRemainsInSession()
    {
        var session = await SeedSession();
        var participant = new Participant { Name = "Alice", SessionId = session.Id };
        _context.Participants.Add(participant);
        await _context.SaveChangesAsync();

        var idea = new Idea { Text = "Idea from Alice", SessionId = session.Id, ParticipantId = participant.Id };
        _context.Ideas.Add(idea);
        await _context.SaveChangesAsync();

        var ideaId = idea.Id;
        await _controller.DeleteParticipant(participant.Id);

        var remainingIdea = await _context.Ideas.FindAsync(ideaId);
        remainingIdea.Should().NotBeNull();
        remainingIdea!.SessionId.Should().Be(session.Id);
    }

    // [Fact]
    // public async Task PutParticipant_IdMismatch_ReturnsBadRequest()
    // {
    //     var participant = new Participant { Id = 1, Name = "Alice", SessionId = 1 };

    //     var result = await _controller.PutParticipant(2, participant);

    //     result.Should().BeOfType<BadRequestResult>();
    // }
}
