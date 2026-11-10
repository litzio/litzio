/** Thin Shell COM bridge. No filesystem deletion or legacy fallback is permitted here.
 * https://learn.microsoft.com/windows/win32/api/shobjidl_core/nf-shobjidl_core-ifileoperation-setoperationflags
 */
export const WINDOWS_TRASH_SOURCE = String.raw`
using System;
using System.Runtime.InteropServices;
namespace Litzio {
  [ComImport, Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IShellItem {}
  [ComImport, Guid("947AAB5F-0A5C-4C13-B4D6-4BF7836FC9F8"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IFileOperation {
    [PreserveSig] int Advise(IntPtr sink, out uint cookie);
    [PreserveSig] int Unadvise(uint cookie);
    [PreserveSig] int SetOperationFlags(uint flags);
    [PreserveSig] int SetProgressMessage([MarshalAs(UnmanagedType.LPWStr)] string message);
    [PreserveSig] int SetProgressDialog(IntPtr dialog);
    [PreserveSig] int SetProperties(IntPtr properties);
    [PreserveSig] int SetOwnerWindow(IntPtr window);
    [PreserveSig] int ApplyPropertiesToItem(IntPtr item);
    [PreserveSig] int ApplyPropertiesToItems(IntPtr items);
    [PreserveSig] int RenameItem(IntPtr item, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    [PreserveSig] int RenameItems(IntPtr items, [MarshalAs(UnmanagedType.LPWStr)] string name);
    [PreserveSig] int MoveItem(IntPtr item, IntPtr destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    [PreserveSig] int MoveItems(IntPtr items, IntPtr destination);
    [PreserveSig] int CopyItem(IntPtr item, IntPtr destination, [MarshalAs(UnmanagedType.LPWStr)] string name, IntPtr sink);
    [PreserveSig] int CopyItems(IntPtr items, IntPtr destination);
    [PreserveSig] int DeleteItem(IShellItem item, IntPtr sink);
    [PreserveSig] int DeleteItems(IntPtr items);
    [PreserveSig] int NewItem(IntPtr destination, uint attributes, [MarshalAs(UnmanagedType.LPWStr)] string name, [MarshalAs(UnmanagedType.LPWStr)] string template, IntPtr sink);
    [PreserveSig] int PerformOperations();
    [PreserveSig] int GetAnyOperationsAborted([MarshalAs(UnmanagedType.Bool)] out bool aborted);
  }
  public static class Recycle {
    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    static extern void SHCreateItemFromParsingName(string path, IntPtr context, ref Guid iid, out IShellItem item);
    static void Check(int result) { Marshal.ThrowExceptionForHR(result); }
    public static void Move(string path, bool interactive) {
      // The boolean is supplied from Environment.UserInteractive by the only production caller.
      // Tests can exercise the refusal without creating a Windows service or touching the source.
      if (!interactive || !Environment.UserInteractive || Environment.OSVersion.Version < new Version(6, 2)) throw new InvalidOperationException("LITZIO_TRASH_UNAVAILABLE");
      const uint FOFX_RECYCLEONDELETE = 0x00080000;
      const uint FOFX_EARLYFAILURE = 0x00100000;
      const uint FOF_NOERRORUI = 0x0400, FOF_SILENT = 0x0004, FOF_NOCONFIRMATION = 0x0010;
      IShellItem item = null;
      IFileOperation operation = null;
      try {
        operation = (IFileOperation)Activator.CreateInstance(Type.GetTypeFromCLSID(new Guid("3AD05575-8857-4850-9277-11B85BDB8E09")));
        Check(operation.SetOperationFlags(FOFX_RECYCLEONDELETE | FOFX_EARLYFAILURE | FOF_NOERRORUI | FOF_SILENT | FOF_NOCONFIRMATION));
        Guid iid = new Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE");
        SHCreateItemFromParsingName(path, IntPtr.Zero, ref iid, out item);
        Check(operation.DeleteItem(item, IntPtr.Zero));
        Check(operation.PerformOperations());
        bool aborted;
        Check(operation.GetAnyOperationsAborted(out aborted));
        if (aborted) throw new InvalidOperationException("The recycle operation was aborted.");
      } finally {
        if (item != null) Marshal.ReleaseComObject(item);
        if (operation != null) Marshal.ReleaseComObject(operation);
      }
    }
  }
}`;

export const WINDOWS_TRASH_SCRIPT = "$ErrorActionPreference='Stop'; Add-Type -TypeDefinition $env:LITZIO_TRASH_SOURCE; [Litzio.Recycle]::Move($env:LITZIO_TRASH_FILE, [Environment]::UserInteractive)";
