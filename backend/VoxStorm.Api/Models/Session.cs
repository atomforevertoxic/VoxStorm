using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace VoxStorm.Api.Models
{
    public class Session
    {
        [Key]
        public int Id { get; set; }
        
        [Required]
        [MaxLength(200)]
        public string Name { get; set; }
        
        [MaxLength(500)]
        public string CentralTheme { get; set; }
        
        [Required]
        public string Method { get; set; } = "association";
        
        public DateTime CreatedAt { get; set; } = DateTime.Now;
        
        public DateTime? StartedAt { get; set; }
        
        public DateTime? EndedAt { get; set; }
        
        public string Status { get; set; } = "pending";
        
        public ICollection<Participant> Participants { get; set; } = new List<Participant>();
        
        public ICollection<Idea> Ideas { get; set; } = new List<Idea>();
    }
}
