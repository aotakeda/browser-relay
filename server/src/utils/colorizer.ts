import * as colors from '@colors/colors';

export function colorizeJSON(obj: unknown, indent = 0): string {
  const spaces = '  '.repeat(indent);
  
  if (obj === null) {
    return colors.gray('null');
  }
  
  if (typeof obj === 'string') {
    return colors.green(`"${obj}"`);
  }
  
  if (typeof obj === 'number') {
    return colors.yellow(obj.toString());
  }
  
  if (typeof obj === 'boolean') {
    return colors.cyan(obj.toString());
  }
  
  if (Array.isArray(obj)) {
    if (obj.length === 0) {
      return colors.gray('[]');
    }
    
    const items = obj.map(item => 
      spaces + '  ' + colorizeJSON(item, indent + 1)
    ).join(',\n');
    
    return `[\n${items}\n${spaces}]`;
  }
  
  if (typeof obj === 'object') {
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return colors.gray('{}');
    }
    
    const items = keys.map(key => {
      const coloredKey = colors.blue(`"${key}"`);
      const coloredValue = colorizeJSON(obj[key as keyof typeof obj], indent + 1);
      return `${spaces}  ${coloredKey}: ${coloredValue}`;
    }).join(',\n');
    
    return `{\n${items}\n${spaces}}`;
  }
  
  return colors.gray(String(obj));
}

export function formatLogEntry(level: string, timestamp: string, data: unknown): string {
  const levelColor = level === 'error' ? colors.red : 
                    level === 'warn' ? colors.yellow : 
                    colors.green;
  
  const formattedTime = colors.gray(`[${timestamp}]`);
  const formattedLevel = levelColor(level.toUpperCase());
  const formattedData = colorizeJSON(data);
  
  return `${formattedTime} ${formattedLevel}:\n${formattedData}`;
}