# PlugBotBase

Provides a configuration-driven base for building [plug.dj](https://plug.dj) bots which run in [Node.js](https://nodejs.org/). ***This project is not yet ready for consumption!***

# What's the point?

PlugBotBase has the following goals:

* To abstract away the details of the plug.dj API
* To make it simple to add new functionality to a bot
* To encourage good architecture in client applications, especially via loose coupling
* To provide enough configuration to be useful, but not so much to be overwhelming

This project was created after I wrote my own plug.dj bot, which had to be modified on a regular basis due to changes in the underlying API. Eventually I ended up retiring the bot as I didn't have enough time to keep up with the changes I was seeing. After learning from my mistakes there, I decided it would be best to create a separate NPM module which could be utilized to provide the basic bot framework. Then, I could create my bot by focusing just on the behaviors I wanted to achieve, and not worry too much about how to interface with plug.dj itself.

# What PlugBotBase is not

PlugBotBase is *not* a fully-functional bot in any sense of the term. If you download and run the project, it will do just two things:

1. Log into a plug.dj room using configuration-provided values, and
2. Perform some application logging of the things it sees while there.

PlugBotBase is intended only as a starting point for building functional bots.

# Who's using PlugBotBase

Right now I'm using PlugBotBase to power my own bot, called [EmancipatorBot](https://github.com/chrishayesmu/EmancipatorBot). If you're using PlugBotBase in your own project, let me know!

# Getting started

Running a bot on top of PlugBotBase is straightforward. You need to set up some required configuration (see below), then you're ready to add functionality to your bot, which is a simple matter of having files in the right directory structure.

You can follow the [Getting Started guide](https://github.com/chrishayesmu/PlugBotBase/wiki/Getting-Started).

# FAQ

#### My bot claims to connect to the room, but I'm seeing the error `[plugAPI]  Error while joining: notFound` and the bot never appears in the room.

This seems to be an issue with the underlying [PlugAPI](https://github.com/plugCubed/plugAPI) we are using; it reports successful connection to the room when this is not the case. This occurs if the room name you specified in your config is not valid. Keep in mind that if the room you're trying to join is private, you do not specify the room name directly. Instead, you should use the number which appears in the URL as the room name.

#### I keep seeing messages saying "UNKNOWN MESSAGE FORMAT" in my logs.

This is nothing to worry about. It occurs when the [PlugAPI](https://github.com/plugCubed/plugAPI) implementation we are using encounters an event message it's not familiar with. Such messages are still passed through to PlugBotBase and handled (or not) appropriately from there, so these warnings can be safely ignored.

That said, if you see a warning for a message type you'd like to use in your own application that isn't supported, feel free to [raise an issue about it](https://github.com/chrishayesmu/PlugBotBase/issues) or submit a pull request.
