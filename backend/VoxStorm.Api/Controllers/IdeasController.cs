using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;
using VoxStorm.Api.Services;

namespace VoxStorm.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class IdeasController : ControllerBase
    {
        private readonly AppDbContext _context;

        public IdeasController(AppDbContext context, ILlmService llmService)
        {
            _context = context;
            _llmService = llmService;
        }

        private readonly ILlmService _llmService;

        // POST: api/Ideas/process-raw
        [HttpPost("process-raw")]
        public async Task<ActionResult<ProcessedIdeasResponseDto>> ProcessRawTranscript([FromBody] ProcessRawTranscriptDto dto)
        {
            Console.WriteLine($"ProcessRawTranscript called with transcript length: {dto.Transcript?.Length ?? 0}");

            try
            {
                var session = await _context.Sessions.FindAsync(dto.SessionId);
                var centralTheme = session?.CentralTheme ?? "brainstorming";

                var processedIdeas = await _llmService.ProcessTranscriptAsync(
                    dto.Transcript ?? "",
                    centralTheme,
                    dto.SessionId
                );

                var response = new ProcessedIdeasResponseDto
                {
                    Ideas = processedIdeas.Select(i => new IdeaDto
                    {
                        Text = i.Text,
                        Category = i.Category,
                        ParentIdeaId = i.ParentIdeaId,
                        Relevance = i.Relevance
                    }).ToList()
                };

                Console.WriteLine($"LLM returned {response.Ideas.Count} ideas");
                return Ok(response);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error processing transcript: {ex.Message}");
                return StatusCode(500, new { error = "Failed to process transcript", details = ex.Message });
            }
        }

        // POST: api/Ideas/categorize
        [HttpPost("categorize")]
        public async Task<ActionResult<CategorizeResponseDto>> CategorizeText([FromBody] CategorizeRequestDto dto)
        {
            try
            {
                var result = await _llmService.CategorizeTextAsync(dto.Text, dto.CentralTheme);
                return Ok(result);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error categorizing text: {ex.Message}");
                return Ok(new CategorizeResponseDto { Category = "general", Relevance = 100 });
            }
        }

        // GET: api/Ideas
        [HttpGet]
        public async Task<ActionResult<IEnumerable<Idea>>> GetIdeas()
        {
            return await _context.Ideas
                .Include(i => i.Participant)
                .Include(i => i.Session)
                .Include(i => i.ChildIdeas)
                .ToListAsync();
        }

        // GET: api/Ideas/5
        [HttpGet("{id}")]
        public async Task<ActionResult<Idea>> GetIdea(int id)
        {
            var idea = await _context.Ideas
                .Include(i => i.Participant)
                .Include(i => i.Session)
                .Include(i => i.ChildIdeas)
                .FirstOrDefaultAsync(i => i.Id == id);

            if (idea == null)
            {
                return NotFound();
            }

            return idea;
        }

        // POST: api/Ideas
        [HttpPost]
        public async Task<ActionResult<Idea>> PostIdea([FromBody] CreateIdeaDto dto)
        {
            Console.WriteLine($"PostIdea called with: Text={dto.Text}, SessionId={dto.SessionId}, ParticipantId={dto.ParticipantId}, Category={dto.Category}");

            try
            {
                var idea = new Idea
                {
                    Text = dto.Text,
                    SessionId = dto.SessionId,
                    ParticipantId = dto.ParticipantId,
                    Category = dto.Category,
                    ParentIdeaId = dto.ParentIdeaId,
                    CreatedAt = DateTime.Now,
                    Relevance = dto.Relevance
                };

                _context.Ideas.Add(idea);
                await _context.SaveChangesAsync();
                Console.WriteLine($"Idea saved successfully with Id={idea.Id}");
                return CreatedAtAction(nameof(GetIdea), new { id = idea.Id }, idea);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error saving idea: {ex.Message}");
                Console.WriteLine($"Inner exception: {ex.InnerException?.Message}");
                throw;
            }
        }

        // PUT: api/Ideas/5
        [HttpPut("{id}")]
        public async Task<IActionResult> PutIdea(int id, Idea idea)
        {
            if (id != idea.Id)
            {
                return BadRequest();
            }

            _context.Entry(idea).State = EntityState.Modified;

            try
            {
                await _context.SaveChangesAsync();
            }
            catch (DbUpdateConcurrencyException)
            {
                if (!IdeaExists(id))
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

        // DELETE: api/Ideas/5
        [HttpDelete("{id}")]
        public async Task<IActionResult> DeleteIdea(int id)
        {
            var idea = await _context.Ideas.FindAsync(id);
            if (idea == null)
            {
                return NotFound();
            }

            _context.Ideas.Remove(idea);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        private bool IdeaExists(int id)
        {
            return _context.Ideas.Any(e => e.Id == id);
        }
    }
}
