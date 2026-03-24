using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;

namespace VoxStorm.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class SessionsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public SessionsController(AppDbContext context)
        {
            _context = context;
        }

        // GET: api/Sessions
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Session>>> GetSessions()
        {
            return await _context.Sessions
                .Include(s => s.Participants)
                .Include(s => s.Ideas)
                .ToListAsync();
        }

        // GET: api/Sessions/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Session>> GetSession(int id)
        {
            var session = await _context.Sessions
                .Include(s => s.Participants)
                .Include(s => s.Ideas)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (session == null)
            {
                return NotFound();
            }

            return session;
        }

        // GET: api/Sessions/5/stats
        [HttpGet("{id}/stats")]
        public async Task<ActionResult<SessionStatsDto>> GetSessionStats(int id)
        {
            var session = await _context.Sessions
                .Include(s => s.Participants)
                .Include(s => s.Ideas)
                .FirstOrDefaultAsync(s => s.Id == id);

            if (session == null)
            {
                return NotFound();
            }

            var ideas = session.Ideas.ToList();
            var duration = session.EndedAt.HasValue && session.StartedAt.HasValue
                ? session.EndedAt.Value - session.StartedAt.Value
                : (session.EndedAt.HasValue ? session.EndedAt.Value - session.CreatedAt : TimeSpan.Zero);

            var categories = ideas
                .Where(i => !string.IsNullOrEmpty(i.Category))
                .GroupBy(i => i.Category)
                .ToDictionary(g => g.Key, g => g.Count());

            var participantIdeas = ideas
                .Where(i => i.ParticipantId.HasValue)
                .GroupBy(i => i.ParticipantId)
                .ToDictionary(g => g.Key.Value, g => g.Count());

            var stats = new SessionStatsDto
            {
                SessionId = session.Id,
                SessionName = session.Name,
                CentralTheme = session.CentralTheme,
                Status = session.Status,
                CreatedAt = session.CreatedAt,
                StartedAt = session.StartedAt,
                EndedAt = session.EndedAt,
                DurationSeconds = (int)duration.TotalSeconds,
                TotalIdeas = ideas.Count,
                ApprovedIdeas = ideas.Count(i => i.IsApproved),
                PendingIdeas = ideas.Count(i => !i.IsApproved),
                ParticipantCount = session.Participants.Count,
                Categories = categories,
                IdeasPerParticipant = participantIdeas,
                Ideas = ideas.OrderByDescending(i => i.CreatedAt).ToList(),
                Participants = session.Participants.ToList()
            };

            return stats;
        }

        public class SessionStatsDto
        {
            public int SessionId { get; set; }
            public string SessionName { get; set; }
            public string CentralTheme { get; set; }
            public string Status { get; set; }
            public DateTime CreatedAt { get; set; }
            public DateTime? StartedAt { get; set; }
            public DateTime? EndedAt { get; set; }
            public int DurationSeconds { get; set; }
            public int TotalIdeas { get; set; }
            public int ApprovedIdeas { get; set; }
            public int PendingIdeas { get; set; }
            public int ParticipantCount { get; set; }
            public Dictionary<string, int> Categories { get; set; }
            public Dictionary<int, int> IdeasPerParticipant { get; set; }
            public List<Idea> Ideas { get; set; }
            public List<Participant> Participants { get; set; }
        }

        // POST: api/Sessions
        [HttpPost]
        public async Task<ActionResult<Session>> PostSession([FromBody] SessionCreateDto sessionDto)
        {
            var session = new Session
            {
                Name = sessionDto.Name,
                CentralTheme = sessionDto.CentralTheme,
                Method = sessionDto.Method,
                CreatedAt = DateTime.Now,
                Status = "pending",
                Participants = sessionDto.Participants?.Select(p => new Participant { Name = p.Name }).ToList() ?? new List<Participant>()
            };

            _context.Sessions.Add(session);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetSession), new { id = session.Id }, session);
        }

        // DTO for session creation
        public class SessionCreateDto
        {
            public string Name { get; set; }
            public string CentralTheme { get; set; }
            public string Method { get; set; }
            public List<ParticipantDto> Participants { get; set; }
        }

        public class ParticipantDto
        {
            public string Name { get; set; }
        }

        // PUT: api/Sessions/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutSession(int id, Session session)
        {
            if (id != session.Id)
            {
                return BadRequest();
            }

            _context.Entry(session).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!SessionExists(id))
                {
                    return NotFound();
                }
                else
                {
                    throw;
                }
            }

            return NoContent();
        }

        // DELETE: api/Sessions/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteSession(int id)
        {
            var session = await _context.Sessions.FindAsync(id);
            if (session == null)
            {
                return NotFound();
            }

            _context.Sessions.Remove(session);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool SessionExists(int id)
        {
            return _context.Sessions.Any(e => e.Id == id);
        }
    }
}
