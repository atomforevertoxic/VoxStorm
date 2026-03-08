using System;
using System.ComponentModel.DataAnnotations;

namespace VoxStorm.Api.Models
{
    public class Idea
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        public string Text { get; set; }
        
        public string Category { get; set; }
        
        public bool IsApproved { get; set; } = false;
        
        public int? ParticipantId { get; set; }
        
        public Participant Participant { get; set; }
        
        public int SessionId { get; set; }
        
        public Session Session { get; set; }
        
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        
        public int? ParentIdeaId { get; set; }
        
        public Idea ParentIdea { get; set; }
        
        public ICollection<Idea> ChildIdeas { get; set; } = new List<Idea>();
    }
}
