using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Controllers;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;
using FluentAssertions;
using Microsoft.AspNetCore.Mvc;

namespace VoxStorm.Api.Tests.Controllers;

public class SessionsControllerTests : IDisposable
{
    private readonly AppDbContext _context;
    private readonly SessionsController _controller;

    public SessionsControllerTests()
    {
        var options = new DbContextOptionsBuilder<AppDbContext>()
            .UseInMemoryDatabase(databaseName: Guid.NewGuid().ToString())
            .Options;
        _context = new AppDbContext(options);
        _controller = new SessionsController(_context);
    }

    public void Dispose()
    {
        _context.Database.EnsureDeleted();
        _context.Dispose();
    }

    private Session CreateTestSession(string name = "Test Session", string status = "pending")
    {
        return new Session
        {
            Name = name,
            CentralTheme = "Test Theme",
            Method = "association",
            Status = status,
            CreatedAt = DateTime.UtcNow
        };
    }

    [Fact]
    public async Task GetSessions_ReturnsAllSessions()
    {
        _context.Sessions.AddRange(CreateTestSession("Session 1"), CreateTestSession("Session 2"));
        await _context.SaveChangesAsync();

        var result = await _controller.GetSessions();

        var sessions = result.Value.Should().BeAssignableTo<IEnumerable<Session>>().Subject;
        sessions.Should().HaveCount(2);
    }

    [Fact]
    public async Task GetSession_ExistingId_ReturnsSession()
    {
        var session = CreateTestSession();
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var result = await _controller.GetSession(session.Id);

        var returned = result.Value.Should().BeAssignableTo<Session>().Subject;
        returned.Name.Should().Be("Test Session");
        returned.CentralTheme.Should().Be("Test Theme");
    }

    // [Fact]
    // public async Task GetSession_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.GetSession(999);

    //     result.Result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task PostSession_ValidDto_CreatesSession()
    {
        var dto = new SessionsController.SessionCreateDto
        {
            Name = "New Session",
            CentralTheme = "Innovation",
            Method = "association",
            Participants = new List<SessionsController.ParticipantDto>
            {
                new() { Name = "Alice" },
                new() { Name = "Bob" }
            }
        };

        var result = await _controller.PostSession(dto);

        var created = result.Result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var session = created.Value.Should().BeAssignableTo<Session>().Subject;
        session.Name.Should().Be("New Session");
        session.Status.Should().Be("pending");
        session.Participants.Should().HaveCount(2);
    }

    [Fact]
    public async Task PostSession_WithNoParticipants_CreatesSessionWithEmptyList()
    {
        var dto = new SessionsController.SessionCreateDto
        {
            Name = "Solo Session",
            CentralTheme = "Theme",
            Method = "association",
            Participants = null
        };

        var result = await _controller.PostSession(dto);

        var created = result.Result.Should().BeOfType<CreatedAtActionResult>().Subject;
        var session = created.Value.Should().BeAssignableTo<Session>().Subject;
        session.Participants.Should().BeEmpty();
    }

    [Fact]
    public async Task PutSession_UpdatesStatus()
    {
        var session = CreateTestSession();
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var dto = new SessionsController.SessionUpdateDto { Status = "active", StartedAt = DateTime.UtcNow };

        var result = await _controller.PutSession(session.Id, dto);

        result.Should().BeOfType<NoContentResult>();
        var updated = await _context.Sessions.FindAsync(session.Id);
        updated!.Status.Should().Be("active");
        updated.StartedAt.Should().NotBeNull();
    }

    // [Fact]
    // public async Task PutSession_NonExistentId_ReturnsNotFound()
    // {
    //     var dto = new SessionsController.SessionUpdateDto { Status = "active" };

    //     var result = await _controller.PutSession(999, dto);

    //     result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task DeleteSession_ExistingId_DeletesSession()
    {
        var session = CreateTestSession();
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var result = await _controller.DeleteSession(session.Id);

        result.Should().BeOfType<NoContentResult>();
        _context.Sessions.Should().BeEmpty();
    }

    // [Fact]
    // public async Task DeleteSession_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.DeleteSession(999);

    //     result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task DeleteSession_CascadesDeletesIdeasAndParticipants()
    {
        var session = CreateTestSession();
        var participant = new Participant { Name = "Alice", SessionId = 0 };
        var idea = new Idea { Text = "Test idea", SessionId = 0 };
        session.Participants.Add(participant);
        session.Ideas.Add(idea);
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        await _controller.DeleteSession(session.Id);

        _context.Ideas.Should().BeEmpty();
        _context.Participants.Should().BeEmpty();
    }

    [Fact]
    public async Task GetCompletedSessions_ReturnsOnlyCompleted()
    {
        _context.Sessions.AddRange(
            CreateTestSession("Active", "active"),
            CreateTestSession("Completed", "completed"),
            CreateTestSession("Pending", "pending")
        );
        await _context.SaveChangesAsync();

        var result = await _controller.GetCompletedSessions();

        var sessions = result.Value.Should().BeAssignableTo<IEnumerable<Session>>().Subject;
        sessions.Should().HaveCount(1);
        sessions.First().Name.Should().Be("Completed");
    }

    [Fact]
    public async Task ResumeSession_CompletedSession_SetsStatusToPending()
    {
        var session = CreateTestSession("Completed", "completed");
        session.EndedAt = DateTime.UtcNow.AddHours(-1);
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var result = await _controller.ResumeSession(session.Id);

        result.Should().BeOfType<NoContentResult>();
        var updated = await _context.Sessions.FindAsync(session.Id);
        updated!.Status.Should().Be("pending");
        updated.EndedAt.Should().BeNull();
    }

    // [Fact]
    // public async Task ResumeSession_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.ResumeSession(999);

    //     result.Should().BeOfType<NotFoundResult>();
    // }

    [Fact]
    public async Task UpdateCenterPosition_ExistingSession_UpdatesPosition()
    {
        var session = CreateTestSession();
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var dto = new SessionsController.CenterPositionDto { PositionX = 100.5, PositionY = 200.3 };

        var result = await _controller.UpdateCenterPosition(session.Id, dto);

        result.Should().BeOfType<NoContentResult>();
        var updated = await _context.Sessions.FindAsync(session.Id);
        updated!.CenterPositionX.Should().Be(100.5);
        updated.CenterPositionY.Should().Be(200.3);
    }

    [Fact]
    public async Task GetSessionStats_ReturnsCorrectCounts()
    {
        var session = CreateTestSession();
        var p1 = new Participant { Name = "Alice", SessionId = 0 };
        var p2 = new Participant { Name = "Bob", SessionId = 0 };
        session.Participants.Add(p1);
        session.Participants.Add(p2);
        session.Ideas.Add(new Idea { Text = "Idea 1", Category = "Возможность", IsApproved = true, ParticipantId = 1, Relevance = 80 });
        session.Ideas.Add(new Idea { Text = "Idea 2", Category = "Риск", IsApproved = false, ParticipantId = 2, Relevance = 70 });
        session.Ideas.Add(new Idea { Text = "Idea 3", Category = "Возможность", IsApproved = true, Relevance = 90 });
        session.StartedAt = DateTime.UtcNow.AddHours(-1);
        session.EndedAt = DateTime.UtcNow;
        session.Status = "completed";
        _context.Sessions.Add(session);
        await _context.SaveChangesAsync();

        var result = await _controller.GetSessionStats(session.Id);

        var stats = result.Value.Should().BeAssignableTo<SessionsController.SessionStatsDto>().Subject;
        stats.TotalIdeas.Should().Be(3);
        stats.ApprovedIdeas.Should().Be(2);
        stats.PendingIdeas.Should().Be(1);
        stats.ParticipantCount.Should().Be(2);
        stats.Categories.Should().ContainKey("Возможность");
        stats.Categories["Возможность"].Should().Be(2);
        stats.Categories["Риск"].Should().Be(1);
        stats.DurationSeconds.Should().BeGreaterThan(0);
    }

    // [Fact]
    // public async Task GetSessionStats_NonExistentId_ReturnsNotFound()
    // {
    //     var result = await _controller.GetSessionStats(999);

    //     result.Result.Should().BeOfType<NotFoundResult>();
    // }
}
