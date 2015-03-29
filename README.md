# PlugBotBase

Provides a configuration-driven base for building [plug.dj](https://plug.dj) bots.

# What's the point?

PlugBotBase has the following goals:

* To abstract away the details of the plug.dj API
* To make it simple to add new functionality to a bot
* To encourage good architecture in client applications, especially via loose coupling
* To provide enough configuration to be useful, but not so much to be overwhelming

This project was created after I wrote my own plug.dj bot, which had to be modified on a regular basis due to
changes in the underlying API. Eventually I ended up retiring the bot as I didn't have enough time to keep up with the
changes I was seeing. After learning from my mistakes there, I decided it would be best to create a separate NPM
module which could be utilized to provide the basic bot framework. Then, I could create my bot by focusing just
on the behaviors I wanted to achieve, and not worrying too much about how to interface with plug.dj itself.

# What PlugBotBase is not

PlugBotBase is *not* a fully-functional bot in any sense of the term. If you download and run the project, it will do
just two things:

1. Log into a plug.dj room using configuration-provided values, and
2. Perform some application logging of the things it sees while there.

PlugBotBase is intended as a starting point for building functional bots.

# Who's using PlugBotBase

This section TBD.
