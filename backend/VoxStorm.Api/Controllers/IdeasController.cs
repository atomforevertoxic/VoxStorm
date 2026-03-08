using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using VoxStorm.Api.Data;
using VoxStorm.Api.Models;

namespace VoxStorm.Api.Controllers
{
    [Route("api/[controller]")]
    [ApiController]
    public class IdeasController : ControllerBase
    {
        private readonly AppDbContext _context;

        public IdeasController(AppDbContext context)
        {
            _context = context;
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
        public async Task<ActionResult<Idea>> PostIdea(Idea idea)
        {
            _context.Ideas.Add(idea);
            await _context.SaveChangesAsync();

            return CreatedAtAction(nameof(GetIdea), new { id = idea.Id }, idea);
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
