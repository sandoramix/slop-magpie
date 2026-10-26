import { cn } from '@/lib/utils';
import { X } from 'lucide-react-native';
import { Platform, Pressable, TextInput, View } from 'react-native';
import { Icon } from '@/components/ui/icon';

type InputProps = React.ComponentProps<typeof TextInput> &
  React.RefAttributes<TextInput> & {
    /** Shows an X inside the field while it has text; needs `onChangeText`. */
    clearable?: boolean;
    /** Classes for the wrapper that `clearable` adds (e.g. `flex-1` in a row). */
    containerClassName?: string;
  };

function Input({ className, clearable, containerClassName, ...props }: InputProps) {
  const field = (
    <TextInput
      className={cn(
        'dark:bg-input/30 border-input bg-background text-foreground flex h-12 w-full min-w-0 flex-row items-center rounded-xl border px-4 py-2 text-base leading-5 shadow-sm shadow-black/5',
        props.editable === false &&
        cn(
          'opacity-50',
          Platform.select({ web: 'disabled:pointer-events-none disabled:cursor-not-allowed' })
        ),
        Platform.select({
          web: cn(
            'placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none transition-[color,box-shadow] md:text-sm',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
            'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive'
          ),
          native: 'placeholder:text-muted-foreground/50',
        }),
        clearable && 'pr-12',
        className
      )}
      {...props}
    />
  );
  if (!clearable) return field;

  const showClear = !!props.value && props.editable !== false;
  return (
    <View className={cn('w-full justify-center', containerClassName)}>
      {field}
      {showClear ? (
        <Pressable
          onPress={() => {
            props.onChangeText?.('');
          }}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Clear"
          className={cn(
            'absolute right-1 h-10 w-10 items-center justify-center rounded-full active:bg-accent',
            props.multiline && 'top-1'
          )}
        >
          <Icon as={X} size={20} className="text-muted-foreground" />
        </Pressable>
      ) : null}
    </View>
  );
}

export { Input };
