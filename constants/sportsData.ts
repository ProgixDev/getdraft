/**
 * 15 Most Played Sports Worldwide with Correct Positions and Levels
 * Based on global popularity rankings and official competition structures
 */

export interface SportWithPositions {
    id: string;
    name: string;
    positions: string[];
    levels: string[];
}

export const SPORTS_WITH_POSITIONS: SportWithPositions[] = [
    {
        id: 'soccer',
        name: 'Soccer',
        positions: [
            'Goalkeeper',
            'Center Back',
            'Full Back',
            'Wing Back',
            'Defensive Midfielder',
            'Central Midfielder',
            'Attacking Midfielder',
            'Winger',
            'Striker',
        ],
        levels: ['Recreational', 'Club', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I', 'Semi-Pro', 'MLS/NWSL', 'International'],
    },
    {
        id: 'basketball',
        name: 'Basketball',
        positions: [
            'Point Guard',
            'Shooting Guard',
            'Small Forward',
            'Power Forward',
            'Center',
        ],
        levels: ['Recreational', 'AAU', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I', 'G-League', 'NBA/WNBA', 'International'],
    },
    {
        id: 'cricket',
        name: 'Cricket',
        positions: [
            'Batsman',
            'Bowler',
            'All-rounder',
            'Wicket-keeper',
        ],
        levels: ['Club', 'County/State', 'First Class', 'List A', 'T20', 'Test', 'International'],
    },
    {
        id: 'tennis',
        name: 'Tennis',
        positions: [
            'Singles',
            'Doubles',
        ],
        levels: ['Recreational', 'Club', 'High School', 'College', 'USTA/ITF', 'Challenger', 'ATP/WTA', 'Grand Slam'],
    },
    {
        id: 'volleyball',
        name: 'Volleyball',
        positions: [
            'Setter',
            'Outside Hitter',
            'Middle Blocker',
            'Opposite Hitter',
            'Libero',
        ],
        levels: ['Recreational', 'Club', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I', 'Professional', 'International'],
    },
    {
        id: 'table-tennis',
        name: 'Table Tennis',
        positions: [
            'Singles',
            'Doubles',
        ],
        levels: ['Recreational', 'Club', 'High School', 'College', 'State', 'National', 'ITTF', 'Olympic'],
    },
    {
        id: 'baseball',
        name: 'Baseball',
        positions: [
            'Pitcher',
            'Catcher',
            'First Baseman',
            'Second Baseman',
            'Third Baseman',
            'Shortstop',
            'Left Fielder',
            'Center Fielder',
            'Right Fielder',
        ],
        levels: ['Little League', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I', 'Minor League', 'MLB', 'International'],
    },
    {
        id: 'american-football',
        name: 'American Football',
        positions: [
            'Quarterback',
            'Running Back',
            'Wide Receiver',
            'Tight End',
            'Offensive Line',
            'Defensive Line',
            'Linebacker',
            'Defensive Back',
            'Kicker',
            'Punter',
        ],
        levels: ['Youth', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I (FBS)', 'NCAA Div I (FCS)', 'CFL', 'NFL', 'International'],
    },
    {
        id: 'hockey',
        name: 'Hockey',
        positions: [
            'Center',
            'Left Wing',
            'Right Wing',
            'Defenseman',
            'Goalie',
        ],
        levels: ['Recreational', 'Youth', 'High School', 'Junior', 'NCAA', 'AHL/ECHL', 'NHL', 'International'],
    },
    {
        id: 'rugby',
        name: 'Rugby',
        positions: [
            'Prop',
            'Hooker',
            'Lock',
            'Flanker',
            'Number 8',
            'Scrum-half',
            'Fly-half',
            'Center',
            'Wing',
            'Fullback',
        ],
        levels: ['Club', 'High School', 'College', 'Semi-Pro', 'MLR', 'International', 'World Cup'],
    },
    {
        id: 'badminton',
        name: 'Badminton',
        positions: [
            'Singles',
            'Doubles',
            'Mixed Doubles',
        ],
        levels: ['Recreational', 'Club', 'High School', 'College', 'State', 'National', 'BWF', 'Olympic'],
    },
    {
        id: 'swimming',
        name: 'Swimming',
        positions: [
            'Freestyle',
            'Backstroke',
            'Breaststroke',
            'Butterfly',
            'Individual Medley',
        ],
        levels: ['Recreational', 'Club', 'High School', 'NCAA', 'National', 'World Championships', 'Olympic'],
    },
    {
        id: 'golf',
        name: 'Golf',
        positions: [
            'Professional',
            'Amateur',
        ],
        levels: ['Recreational', 'Club', 'High School', 'College', 'Amateur', 'PGA/LPGA', 'Major Championships'],
    },
    {
        id: 'lacrosse',
        name: 'Lacrosse',
        positions: [
            'Attack',
            'Midfield',
            'Defense',
            'Goalie',
        ],
        levels: ['Recreational', 'Youth', 'High School', 'NCAA Div III', 'NCAA Div II', 'NCAA Div I', 'MLL/PLL', 'International'],
    },
    {
        id: 'track-field',
        name: 'Track & Field',
        positions: [
            'Sprints',
            'Distance',
            'Hurdles',
            'Jumps',
            'Throws',
        ],
        levels: ['Recreational', 'High School', 'NCAA', 'National', 'World Championships', 'Olympic'],
    },
];
