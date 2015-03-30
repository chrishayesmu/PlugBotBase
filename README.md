# PlugBotBase

Provides a configuration-driven base for building [plug.dj](https://plug.dj) bots. ***This project is not yet ready for consumption!***

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

This section TBD.

# What configuration do I need?

There are only three required pieces of configuration, and one optional. The optional configuration is the only one which is intended to be stored in NPM's config; everything else is stored in a JSON file. The configuration keys are:

* `pbb_config_file`: This is the optional, NPM-only key. You can define this key in your package.json under config, or by using `npm config set ...`. This key tells PlugBotBase where to find your main JSON configuration file. You can supply an absolute or a relative path; if relative, it will be treated as being relative to the directory which contains your package.json file. If not set, the default is "config.json".
* `pbb_bot_email`: This is the email address your bot uses to log in to plug.dj. Facebook logins are not supported.
* `pbb_bot_password`: This is the password your bot uses to log in to plug.dj.
* `pbb_room_name`: This is the name of the room you want your bot to connect to, though "room" is not entirely accurate. When you join a plug.dj room, the URL looks like `https://plug.dj/someroomname`. It is the `someroomname` which you should supply here. Room names can change, but this part of the URL never will.

Everything except `pbb_config_file` should be defined in your JSON configuration file, as top-level elements:

```
{
    "pbb_bot_email" : "mybotemail@gmail.com",
    "pbb_bot_password" : "mypassword",
    "pbb_room_name" : "someroomname"
}
```

Note that these are not the only allowed configuration keys, they're just the only ones required by the framework. You can add any additional keys you want, and they'll be made available to your bot as part of the config object passed around. However, any config key starting with "pbb_" is reserved, and if you add keys which conflict with this, you may find your bot not working or behaving strangely in future versions.

One final note: **configuration is immutable**. There are other mechanisms for passing around global state, but once the bot has started up, you cannot change configuration programmatically.

# FAQ

## My bot claims to connect to the room, but I'm seeing the error `[plugAPI]  Error while joining: notFound` and the bot never appears in the room

This seems to be an issue with the underlying [PlugAPI](https://github.com/plugCubed/plugAPI) we are using; it reports successful connection to the room when this is not the case. This occurs if the room name you specified in your config is not valid. Keep in mind that if the room you're trying to join is private, you do not specify the room name directly. Instead, you should use the number which appears in the URL as the room name.
