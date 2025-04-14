# pco-git

## Install

1. Clone and setup:

   ```bash
   cd ~/Code
   git clone git@github.com:joshwilkerson/pco-git
   cd pco-git
   devbox run setup
   ```

2. Add bin to PATH:

   ```
   echo 'export PATH="$PATH:$HOME/Code/pco-git/bin"' >> ~/.zshrc
   ```

Open a new terminal and run: `pco-git`

## CLI

```
$ pco-git --help

  Usage
    $ pco-git

  Options
    --name  Your name

  Examples
    $ pco-git --name=Jane
    Hello, Jane
```
