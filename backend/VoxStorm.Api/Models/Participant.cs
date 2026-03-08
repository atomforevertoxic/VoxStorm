using System.ComponentModel.DataAnnotations;

namespace VoxStorm.Api.Models
{
    public class Participant
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(100)]
        public string Name { get; set; }
        
        public int SessionId { get; set; }
        
        public Session Session { get; set; }
        
        public ICollection<Idea> Ideas { get; set; } = new List<Idea>();
    }
}
